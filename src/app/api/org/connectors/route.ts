import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin'
import { getMember } from '@/lib/org'
import { getPool } from '@/lib/db'

/** GET /api/org/connectors?orgId=xxx — List connectors for the org (any member). */
export async function GET(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let uid: string
  try {
    const decoded = await getAdminAuth().verifyIdToken(token)
    uid = decoded.uid
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const orgId = req.nextUrl.searchParams.get('orgId')
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 })

  const membership = await getMember(orgId, uid)
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const snap = await getAdminDb()
    .collection('organizations').doc(orgId)
    .collection('connectors')
    .orderBy('createdAt', 'desc')
    .get()

  const connectors = snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      name: data.name,
      columns: data.columns ?? [],
      rowCount: data.rowCount ?? data.matchedCount ?? 0,
      totalRows: data.totalRows ?? 0,
      skippedCount: data.skippedCount ?? 0,
      createdAt: data.createdAt?.toDate?.().toISOString() ?? null,
    }
  })

  return NextResponse.json({ connectors })
}

/** DELETE /api/org/connectors — Remove a connector. Body: { orgId, connectorId }. Owner/admin only. */
export async function DELETE(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let uid: string
  try {
    const decoded = await getAdminAuth().verifyIdToken(token)
    uid = decoded.uid
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { orgId, connectorId } = await req.json()
  if (!orgId || !connectorId) return NextResponse.json({ error: 'orgId and connectorId required' }, { status: 400 })

  const membership = await getMember(orgId, uid)
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const pool = await getPool()
    await pool.query('DELETE FROM connector_rows WHERE connector_id = $1 AND org_id = $2', [connectorId, orgId])
  } catch {}

  await getAdminDb()
    .collection('organizations').doc(orgId)
    .collection('connectors').doc(connectorId)
    .delete()

  return NextResponse.json({ ok: true })
}
