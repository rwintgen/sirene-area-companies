import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin'
import { getOrg, getMember } from '@/lib/org'
import { getPool } from '@/lib/db'
import { FieldValue } from 'firebase-admin/firestore'

const MAX_ROWS = 10_000
const MAX_BYTES = 10 * 1024 * 1024
const BATCH_INSERT = 500

/**
 * POST /api/org/connectors/csv
 *
 * Multipart form data:
 *   - file: CSV file (max 10 MB / 10 000 rows)
 *   - orgId: string
 *   - name: display name for the connector
 *   - latColumn: column name containing latitude values
 *   - lonColumn: column name containing longitude values
 *
 * Parses the CSV, validates lat/lon coordinates, inserts all valid rows
 * into the PostGIS `connector_rows` table, and stores connector metadata
 * in Firestore.
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let uid: string
  try {
    const decoded = await getAdminAuth().verifyIdToken(token)
    uid = decoded.uid
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const orgId = formData.get('orgId')?.toString()
  const name = formData.get('name')?.toString()?.trim()
  const latColumn = formData.get('latColumn')?.toString()
  const lonColumn = formData.get('lonColumn')?.toString()
  const file = formData.get('file') as File | null

  if (!orgId || !latColumn || !lonColumn || !file || !name) {
    return NextResponse.json({ error: 'orgId, latColumn, lonColumn, name, and file are required' }, { status: 400 })
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File exceeds 10 MB limit' }, { status: 413 })
  }

  const org = await getOrg(orgId)
  if (!org) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const membership = await getMember(orgId, uid)
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const text = await file.text()
  const rows = parseCSV(text)

  if (rows.length === 0) return NextResponse.json({ error: 'CSV is empty or could not be parsed' }, { status: 400 })
  if (!Object.prototype.hasOwnProperty.call(rows[0], latColumn)) {
    return NextResponse.json({ error: `Column "${latColumn}" not found in CSV` }, { status: 400 })
  }
  if (!Object.prototype.hasOwnProperty.call(rows[0], lonColumn)) {
    return NextResponse.json({ error: `Column "${lonColumn}" not found in CSV` }, { status: 400 })
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `CSV exceeds ${MAX_ROWS.toLocaleString()} row limit` }, { status: 413 })
  }

  const headers = Object.keys(rows[0])
  const fieldColumns = headers.filter((h) => h !== latColumn && h !== lonColumn)

  const pool = await getPool()

  await pool.query(`
    CREATE TABLE IF NOT EXISTS connector_rows (
      id            SERIAL PRIMARY KEY,
      connector_id  TEXT NOT NULL,
      org_id        TEXT NOT NULL,
      lat           DOUBLE PRECISION NOT NULL,
      lon           DOUBLE PRECISION NOT NULL,
      geom          GEOMETRY(Point, 4326) NOT NULL,
      fields        JSONB NOT NULL DEFAULT '{}'
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_connector_rows_connector ON connector_rows (connector_id)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_connector_rows_geom ON connector_rows USING GIST (geom)`)

  const connectorRef = getAdminDb()
    .collection('organizations').doc(orgId)
    .collection('connectors').doc()
  const connectorId = connectorRef.id

  let insertedCount = 0
  let skippedCount = 0

  for (let i = 0; i < rows.length; i += BATCH_INSERT) {
    const batch = rows.slice(i, i + BATCH_INSERT)
    const values: string[] = []
    const params: any[] = []
    let p = 1

    for (const row of batch) {
      const lat = parseFloat(row[latColumn])
      const lon = parseFloat(row[lonColumn])
      if (!isFinite(lat) || !isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        skippedCount++
        continue
      }
      const fields: Record<string, string> = {}
      for (const col of fieldColumns) fields[col] = row[col] ?? ''
      values.push(`($${p}, $${p + 1}, $${p + 2}, $${p + 3}, ST_SetSRID(ST_MakePoint($${p + 3}, $${p + 2}), 4326), $${p + 4})`)
      params.push(connectorId, orgId, lat, lon, JSON.stringify(fields))
      p += 5
      insertedCount++
    }

    if (values.length > 0) {
      await pool.query(
        `INSERT INTO connector_rows (connector_id, org_id, lat, lon, geom, fields) VALUES ${values.join(', ')}`,
        params,
      )
    }
  }

  if (insertedCount === 0) {
    return NextResponse.json({ error: 'No valid rows found. Ensure latitude and longitude columns contain valid numeric coordinates.' }, { status: 400 })
  }

  await connectorRef.set({
    name,
    columns: fieldColumns,
    rowCount: insertedCount,
    skippedCount,
    totalRows: rows.length,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: uid,
  })

  return NextResponse.json({
    id: connectorId,
    name,
    columns: fieldColumns,
    rowCount: insertedCount,
    skippedCount,
    totalRows: rows.length,
  })
}

function parseCSV(text: string): Array<Record<string, string>> {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  if (lines.length < 2) return []

  const headers = splitCSVLine(lines[0])
  const result: Array<Record<string, string>> = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const values = splitCSVLine(line)
    const obj: Record<string, string> = {}
    headers.forEach((h, idx) => { obj[h] = values[idx] ?? '' })
    result.push(obj)
  }
  return result
}

function splitCSVLine(line: string): string[] {
  const result: string[] = []
  let inQuote = false
  let current = ''

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { current += '"'; i++ }
      else inQuote = !inQuote
    } else if (ch === ',' && !inQuote) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}
