import { NextRequest, NextResponse } from 'next/server'
import { isDbConfigured, getPool } from '@/lib/db'

import fs from 'fs'
import path from 'path'
import { parse } from 'csv-parse/sync'

const GEO_COL = "Géolocalisation de l'établissement"

interface Company {
  lat: number
  lon: number
  fields: Record<string, string>
}

let csvCompaniesCache: Company[] | null = null
let csvColumnsCache: string[] | null = null

/**
 * Parses the sample CSV into an in-memory company array.
 * Results are cached after the first call for the lifetime of the process.
 * Used as a fallback when no PostGIS database is configured.
 */
function loadFromCsv(): { companies: Company[]; columns: string[] } {
  if (csvCompaniesCache && csvColumnsCache) {
    return { companies: csvCompaniesCache, columns: csvColumnsCache }
  }

  const csvPath = path.join(process.cwd(), 'data', 'economicref-france-sirene-v3-sample.csv')
  const content = fs.readFileSync(csvPath, 'utf-8')
  const records = parse(content, { columns: true, skip_empty_lines: true })

  csvColumnsCache = records.length > 0 ? Object.keys(records[0] as Record<string, unknown>) : []

  csvCompaniesCache = (records as any[])
    .filter((r) => r[GEO_COL]?.trim())
    .map((r) => {
      const parts = r[GEO_COL].split(',')
      if (parts.length < 2) return null
      const lat = parseFloat(parts[0].trim())
      const lon = parseFloat(parts[1].trim())
      if (!isFinite(lat) || !isFinite(lon)) return null
      const fields: Record<string, string> = {}
      for (const key of csvColumnsCache!) fields[key] = r[key] ?? ''
      return { lat, lon, fields }
    })
    .filter(Boolean) as Company[]

  console.log(`[csv] Loaded ${csvCompaniesCache.length} companies.`)
  return { companies: csvCompaniesCache, columns: csvColumnsCache }
}

let dbColumnsCache: string[] | null = null

/**
 * Queries the PostGIS `establishments` table for all rows whose `geom`
 * falls within the given GeoJSON geometry (polygon/rectangle).
 * Column names are lazily cached from the first result's JSONB `fields` keys.
 */
const RESULT_LIMIT = 50_000

async function searchWithPostGIS(geometry: any, limit: number): Promise<{ companies: Company[]; columns: string[]; truncated: boolean }> {
  const pool = await getPool()
  const geoJson = JSON.stringify(geometry)
  const effectiveLimit = Math.min(Math.max(limit, 1), RESULT_LIMIT)

  const { rows } = await pool.query<{ lat: number; lon: number; fields: Record<string, string> }>(
    `SELECT lat, lon, fields
     FROM establishments
     WHERE ST_Contains(ST_GeomFromGeoJSON($1), geom)
     LIMIT $2`,
    [geoJson, effectiveLimit]
  )

  if (!dbColumnsCache && rows.length > 0) {
    dbColumnsCache = Object.keys(rows[0].fields)
  }

  return {
    companies: rows.map((r) => ({ lat: r.lat, lon: r.lon, fields: r.fields })),
    columns: dbColumnsCache ?? [],
    truncated: rows.length === effectiveLimit,
  }
}

async function getColumnsFromDb(): Promise<string[]> {
  if (dbColumnsCache) return dbColumnsCache
  const pool = await getPool()
  const { rows } = await pool.query('SELECT fields FROM establishments LIMIT 1')
  if (rows.length > 0) dbColumnsCache = Object.keys(rows[0].fields)
  return dbColumnsCache ?? []
}

/** GET: returns available column names and whether the app is running on sample data. */
export async function GET() {
  try {
    if (isDbConfigured()) {
      try {
        const columns = await getColumnsFromDb()
        return NextResponse.json({ columns, sampleData: false })
      } catch (dbError) {
        console.error('[db] Connection failed, falling back to CSV:', dbError)
        const { columns } = loadFromCsv()
        return NextResponse.json({ columns, sampleData: true, dbError: String(dbError) })
      }
    }
    const { columns } = loadFromCsv()
    return NextResponse.json({ columns, sampleData: true })
  } catch (error) {
    console.error('Columns API error:', error)
    return NextResponse.json({ error: 'Failed to read columns', details: String(error) }, { status: 500 })
  }
}

/** POST: accepts a GeoJSON geometry and an optional result limit, returns companies within that area. */
export async function POST(req: NextRequest) {
  try {
    const { geometry, limit: requestedLimit } = await req.json()
    const limit = typeof requestedLimit === 'number' && requestedLimit > 0
      ? Math.min(requestedLimit, RESULT_LIMIT)
      : RESULT_LIMIT

    if (!geometry) return NextResponse.json({ companies: [] })
    if (!geometry.coordinates || !Array.isArray(geometry.coordinates)) {
      return NextResponse.json({ error: 'Invalid geometry' }, { status: 400 })
    }

    if (isDbConfigured()) {
      try {
        const { companies, columns, truncated } = await searchWithPostGIS(geometry, limit)
        console.log(`[postgis] Found ${companies.length} establishments${truncated ? ' (truncated)' : ''} (limit: ${limit}).`)
        return NextResponse.json({ companies, columns, sampleData: false, truncated, resultLimit: limit })
      } catch (dbError) {
        console.error('[db] Search failed, falling back to CSV:', dbError)
        const { default: booleanPointInPolygon } = await import('@turf/boolean-point-in-polygon')
        const { point } = await import('@turf/helpers')
        const { companies: all, columns } = loadFromCsv()
        const matched = all.filter((c) => booleanPointInPolygon(point([c.lon, c.lat]), geometry))
        const truncated = matched.length > limit
        const companies = truncated ? matched.slice(0, limit) : matched
        console.log(`[csv] Found ${matched.length} establishments, returning ${companies.length} (limit: ${limit}).`)
        return NextResponse.json({ companies, columns, sampleData: true, truncated })
      }
    }

    const { default: booleanPointInPolygon } = await import('@turf/boolean-point-in-polygon')
    const { point } = await import('@turf/helpers')
    const { companies: all, columns } = loadFromCsv()
    const matched = all.filter((c) => booleanPointInPolygon(point([c.lon, c.lat]), geometry))
    const truncated = matched.length > limit
    const companies = truncated ? matched.slice(0, limit) : matched
    console.log(`[csv] Found ${matched.length} establishments, returning ${companies.length} (limit: ${limit}).`)
    return NextResponse.json({ companies, columns, sampleData: true, truncated })
  } catch (error) {
    console.error('Search API error:', error)
    return NextResponse.json({ error: 'Search failed', details: String(error) }, { status: 500 })
  }
}
