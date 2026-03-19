import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

const NAF_DIV = `naf_division`

const PRESET_SQL: Record<string, string> = {
  active:       `statut_admin = 'Actif' AND statut_admin_ul = 'Active' AND (date_fermeture IS NULL OR date_fermeture = '') AND (date_fermeture_ul IS NULL OR date_fermeture_ul = '')`,
  closed:       `(statut_admin = 'Fermé' OR (date_fermeture IS NOT NULL AND date_fermeture != ''))`,
  hq:           `est_siege = true`,
  diffusible:   `diffusible = true`,
  company:      `(legal_form IS NOT NULL AND legal_form != '' AND legal_form NOT LIKE '1%')`,
  freelance:    `legal_form = '1000'`,
  sas:          `(legal_form = '5710' OR legal_form = '5720')`,
  sarl:         `(legal_form = '5499' OR legal_form = '5498')`,
  association:  `(legal_form LIKE '92%' OR (assoc_id IS NOT NULL AND assoc_id != ''))`,
  employer:     `employeur = 'Oui'`,
  pme:          `categorie_ent = 'PME'`,
  'eti-ge':     `(categorie_ent = 'ETI' OR categorie_ent = 'GE')`,
  '50plus':     `tranche_eff_sort >= 21`,
  ess:          `ess = 'O'`,
  mission:      `mission = 'O'`,
  agriculture:  `${NAF_DIV} BETWEEN 1 AND 3`,
  industry:     `${NAF_DIV} BETWEEN 10 AND 33`,
  construction: `${NAF_DIV} BETWEEN 40 AND 43`,
  commerce:     `${NAF_DIV} BETWEEN 44 AND 47`,
  transport:    `${NAF_DIV} BETWEEN 48 AND 53`,
  food:         `${NAF_DIV} BETWEEN 54 AND 56`,
  tech:         `${NAF_DIV} BETWEEN 57 AND 63`,
  finance:      `${NAF_DIV} BETWEEN 64 AND 66`,
  realestate:   `${NAF_DIV} = 68`,
  'pro-services': `(${NAF_DIV} = 67 OR ${NAF_DIV} BETWEEN 69 AND 75)`,
  education:    `${NAF_DIV} = 85`,
  health:       `(${NAF_DIV} = 83 OR ${NAF_DIV} BETWEEN 86 AND 88)`,
}

const PRESET_GROUP: Record<string, string> = {
  active: 'Status', closed: 'Status',
  hq: 'Flags', diffusible: 'Flags',
  company: 'Legal form', freelance: 'Legal form', sas: 'Legal form',
  sarl: 'Legal form', association: 'Legal form',
  employer: 'Size', pme: 'Size', 'eti-ge': 'Size', '50plus': 'Size',
  ess: 'Values', mission: 'Values',
  commerce: 'Sector', industry: 'Sector', construction: 'Sector',
  tech: 'Sector', health: 'Sector', food: 'Sector', transport: 'Sector',
  finance: 'Sector', realestate: 'Sector', 'pro-services': 'Sector',
  education: 'Sector', agriculture: 'Sector',
}

function buildPresetSQL(presets: string[]): string[] {
  const grouped = new Map<string, string[]>()
  for (const id of presets) {
    const sql = PRESET_SQL[id]
    const group = PRESET_GROUP[id] ?? '__other__'
    if (!sql) continue
    if (!grouped.has(group)) grouped.set(group, [])
    grouped.get(group)!.push(`(${sql})`)
  }
  return Array.from(grouped.values()).map((groupClauses) =>
    groupClauses.length > 1 ? `(${groupClauses.join(' OR ')})` : groupClauses[0]
  )
}

/**
 * Derives a grid cell size in degrees from the Leaflet zoom level.
 * Lower zooms produce larger cells (coarse aggregation); higher zooms
 * produce smaller cells until individual points are returned.
 */
function gridSizeForZoom(zoom: number): number {
  if (zoom <= 5)  return 1.0
  if (zoom <= 6)  return 0.5
  if (zoom <= 7)  return 0.25
  if (zoom <= 8)  return 0.12
  if (zoom <= 9)  return 0.06
  if (zoom <= 10) return 0.03
  if (zoom <= 11) return 0.015
  if (zoom <= 12) return 0.008
  if (zoom <= 13) return 0.004
  return 0.002
}

const MAX_ZOOM_FOR_CLUSTERS = 14

/**
 * GET /api/clusters — returns grid-aggregated point counts for the visible viewport.
 *
 * Query params:
 *   bbox   — "west,south,east,north" (required)
 *   zoom   — integer zoom level (required)
 *   presets — comma-separated preset IDs (optional)
 *
 * Returns JSON: { clusters: [{ lat, lng, count }], total }
 * At high zoom (>=15), returns individual points instead of clusters.
 */
export async function GET(req: NextRequest) {
  const t0 = Date.now()
  try {
    const { searchParams } = req.nextUrl
    const bboxParam = searchParams.get('bbox')
    const zoomParam = searchParams.get('zoom')
    const presetsParam = searchParams.get('presets')
    console.log(`[clusters] GET bbox=${bboxParam} zoom=${zoomParam} presets=${presetsParam}`)

    if (!bboxParam || !zoomParam) {
      return NextResponse.json({ error: 'bbox and zoom are required' }, { status: 400 })
    }

    const parts = bboxParam.split(',').map(Number)
    if (parts.length !== 4 || parts.some(isNaN)) {
      return NextResponse.json({ error: 'Invalid bbox format' }, { status: 400 })
    }
    const [west, south, east, north] = parts

    if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) {
      return NextResponse.json({ error: 'Invalid bbox values' }, { status: 400 })
    }

    const zoom = parseInt(zoomParam, 10)
    if (isNaN(zoom) || zoom < 0 || zoom > 22) {
      return NextResponse.json({ error: 'Invalid zoom' }, { status: 400 })
    }

    const presets: string[] = presetsParam
      ? presetsParam.split(',').filter((id) => Object.prototype.hasOwnProperty.call(PRESET_SQL, id))
      : []

    const presetClauses = buildPresetSQL(presets)
    const wherePresets = presetClauses.length > 0 ? ` AND ${presetClauses.join(' AND ')}` : ''

    console.log(`[clusters] connecting to pool...`)
    const tPool = Date.now()
    const pool = await getPool()
    console.log(`[clusters] pool ready in ${Date.now() - tPool}ms`)
    const envelope = `ST_MakeEnvelope($1, $2, $3, $4, 4326)`

    if (zoom >= MAX_ZOOM_FOR_CLUSTERS) {
      console.log(`[clusters] high zoom (${zoom}) → individual points query`)
      const tq = Date.now()
      const { rows } = await pool.query(
        `SELECT lat, lon FROM establishments WHERE geom && ${envelope}${wherePresets} LIMIT 5000`,
        [west, south, east, north]
      )
      console.log(`[clusters] individual query: ${rows.length} rows in ${Date.now() - tq}ms (total ${Date.now() - t0}ms)`)
      return NextResponse.json({
        clusters: rows.map((r) => ({ lat: r.lat, lng: r.lon, count: 1 })),
        total: rows.length,
        zoom,
        individual: true,
      })
    }

    const cellSize = gridSizeForZoom(zoom)
    console.log(`[clusters] bucket query: zoom=${zoom} cellSize=${cellSize}`)
    const tq = Date.now()

    const { rows } = await pool.query(
      `SELECT
        FLOOR(lat / $5) * $5 + $5 / 2 AS clat,
        FLOOR(lon / $5) * $5 + $5 / 2 AS clng,
        COUNT(*) AS count
      FROM establishments
      WHERE geom && ${envelope}${wherePresets}
      GROUP BY 1, 2
      ORDER BY count DESC`,
      [west, south, east, north, cellSize]
    )
    console.log(`[clusters] bucket query: ${rows.length} cells in ${Date.now() - tq}ms (total ${Date.now() - t0}ms)`)

    const clusters = rows.map((r) => ({
      lat: parseFloat(r.clat),
      lng: parseFloat(r.clng),
      count: parseInt(r.count, 10),
    }))
    const total = clusters.reduce((sum, c) => sum + c.count, 0)

    console.log(`[clusters] returning ${clusters.length} clusters, total=${total} in ${Date.now() - t0}ms`)
    return NextResponse.json({ clusters, total, zoom })
  } catch (error) {
    console.error(`[clusters] Error after ${Date.now() - t0}ms:`, error)
    return NextResponse.json({ error: 'Cluster query failed', details: String(error) }, { status: 500 })
  }
}
