#!/usr/bin/env node
// Usage: DATABASE_URL=postgresql://... node scripts/migrate-promoted-columns.js
//
// Backfills the 15 promoted columns from JSONB in batches of 10,000 rows.
// Shows progress after every batch and saves a checkpoint so interrupted
// runs resume from where they left off.
//
// Safe to run multiple times — already-updated rows are skipped.

'use strict'

const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

const BATCH_SIZE = 5_000
const CHECKPOINT_FILE = path.join(__dirname, '..', '.migrate-checkpoint')

if (!process.env.DATABASE_URL) {
  console.error('Set DATABASE_URL before running this script.')
  process.exit(1)
}

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: false })
  await client.connect()
  console.log('✓ Connected to database.')

  // Step 1: Check if columns already exist, add them if not
  console.log('\nStep 1/3 — Checking promoted columns...')
  const colCheck = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'establishments' AND column_name = 'statut_admin'`
  )
  if (colCheck.rows.length === 0) {
    console.log('  Adding columns...')
    await client.query(`
      ALTER TABLE establishments
        ADD COLUMN IF NOT EXISTS statut_admin       TEXT,
        ADD COLUMN IF NOT EXISTS statut_admin_ul    TEXT,
        ADD COLUMN IF NOT EXISTS date_fermeture     TEXT,
        ADD COLUMN IF NOT EXISTS date_fermeture_ul  TEXT,
        ADD COLUMN IF NOT EXISTS est_siege          BOOLEAN,
        ADD COLUMN IF NOT EXISTS diffusible         BOOLEAN,
        ADD COLUMN IF NOT EXISTS ape_code           TEXT,
        ADD COLUMN IF NOT EXISTS naf_division       SMALLINT,
        ADD COLUMN IF NOT EXISTS legal_form         TEXT,
        ADD COLUMN IF NOT EXISTS assoc_id           TEXT,
        ADD COLUMN IF NOT EXISTS categorie_ent      TEXT,
        ADD COLUMN IF NOT EXISTS employeur          TEXT,
        ADD COLUMN IF NOT EXISTS tranche_eff_sort   INTEGER,
        ADD COLUMN IF NOT EXISTS ess                TEXT,
        ADD COLUMN IF NOT EXISTS mission            TEXT
    `)
    console.log('  ✓ Columns created.')
  } else {
    console.log('  ✓ Columns already exist.')
  }

  // Step 2: Count rows that still need updating
  console.log('\nStep 2/3 — Counting rows to update...')
  const countRes = await client.query(
    `SELECT COUNT(*) AS cnt FROM establishments WHERE statut_admin IS NULL`
  )
  const totalToUpdate = parseInt(countRes.rows[0].cnt, 10)
  if (totalToUpdate === 0) {
    console.log('  ✓ All rows already updated. Skipping to index creation.')
  } else {
    console.log(`  → ${totalToUpdate.toLocaleString()} rows need backfilling.`)

    // Resume from checkpoint if one exists
    let lastId = 0
    if (fs.existsSync(CHECKPOINT_FILE)) {
      lastId = parseInt(fs.readFileSync(CHECKPOINT_FILE, 'utf-8').trim(), 10) || 0
      if (lastId > 0) console.log(`  → Resuming from id > ${lastId.toLocaleString()}`)
    }

    // Step 2b: Backfill in batches
    // IMPORTANT: the inner SELECT iterates purely by PK (no statut_admin filter)
    // so Postgres uses the primary key index and never does a full table scan.
    // statut_admin IS NULL is kept as an outer condition to skip already-updated rows.
    console.log('\n  Backfilling...')
    let updated = 0
    const startTime = Date.now()

    while (true) {
      // Fetch next batch of ids using the PK index (fast index scan, ~1ms)
      const idsRes = await client.query(
        `SELECT id FROM establishments WHERE id > $1 ORDER BY id LIMIT $2`,
        [lastId, BATCH_SIZE]
      )
      if (idsRes.rows.length === 0) break

      const batchIds = idsRes.rows.map(r => r.id)
      const batchMaxId = batchIds[batchIds.length - 1] // already sorted ASC

      // Update only the rows in this id range that still need backfilling
      const res = await client.query(`
        UPDATE establishments SET
          statut_admin      = fields->>'Etat administratif de l''établissement',
          statut_admin_ul   = fields->>'Etat administratif de l''unité légale',
          date_fermeture    = fields->>'Date de fermeture de l''établissement',
          date_fermeture_ul = fields->>'Date de fermeture de l''unité légale',
          est_siege         = (fields->>'Etablissement siège') = 'oui',
          diffusible        = (fields->>'Statut de diffusion de l''établissement') = 'O',
          ape_code          = fields->>'Activité principale de l''établissement',
          naf_division      = CASE
                                WHEN (fields->>'Activité principale de l''établissement') ~ '^\\d{2}'
                                THEN CAST(SUBSTRING(fields->>'Activité principale de l''établissement', 1, 2) AS SMALLINT)
                              END,
          legal_form        = fields->>'Catégorie juridique de l''unité légale',
          assoc_id          = fields->>'Identifiant association de l''unité légale',
          categorie_ent     = fields->>'Catégorie de l''entreprise',
          employeur         = fields->>'Caractère employeur de l''établissement',
          tranche_eff_sort  = CAST(NULLIF(fields->>'Tranche de l''effectif de l''établissement triable', '') AS INTEGER),
          ess               = fields->>'Economie sociale et solidaire unité légale',
          mission           = fields->>'Société à mission unité légale'
        WHERE id = ANY($1) AND statut_admin IS NULL
      `, [batchIds])

      lastId = batchMaxId
      fs.writeFileSync(CHECKPOINT_FILE, String(lastId))

      updated += res.rowCount
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0)
      const rate = Math.round(updated / ((Date.now() - startTime) / 1000))
      const remaining = totalToUpdate - updated
      const etaSec = rate > 0 ? Math.round(remaining / rate) : '?'
      const etaStr = typeof etaSec === 'number'
        ? etaSec >= 60 ? `${Math.floor(etaSec / 60)}m${etaSec % 60}s` : `${etaSec}s`
        : '?'

      console.log(
        `  [${elapsed}s] ${updated.toLocaleString()} / ${totalToUpdate.toLocaleString()} rows` +
        `  (${rate.toLocaleString()} rows/s, ETA ${etaStr})`
      )
    }
    console.log(`✓ Backfill complete: ${updated.toLocaleString()} rows updated.`)
    if (fs.existsSync(CHECKPOINT_FILE)) fs.unlinkSync(CHECKPOINT_FILE)
  }

  // Step 3: Create indexes
  console.log('\nStep 3/3 — Creating indexes...')
  const indexes = [
    ['idx_est_statut_admin', 'CREATE INDEX IF NOT EXISTS idx_est_statut_admin ON establishments (statut_admin)'],
    ['idx_est_ape_code',     'CREATE INDEX IF NOT EXISTS idx_est_ape_code     ON establishments (ape_code)'],
    ['idx_est_naf_div',      'CREATE INDEX IF NOT EXISTS idx_est_naf_div      ON establishments (naf_division)'],
    ['idx_est_legal_form',   'CREATE INDEX IF NOT EXISTS idx_est_legal_form   ON establishments (legal_form)'],
    ['idx_est_categorie',    'CREATE INDEX IF NOT EXISTS idx_est_categorie    ON establishments (categorie_ent)'],
    ['idx_est_employeur',    'CREATE INDEX IF NOT EXISTS idx_est_employeur    ON establishments (employeur)'],
    ['idx_geom_active',       "CREATE INDEX IF NOT EXISTS idx_geom_active       ON establishments USING GIST (geom) WHERE statut_admin = 'Actif'"],
    ['idx_geom_active_siege', "CREATE INDEX IF NOT EXISTS idx_geom_active_siege ON establishments USING GIST (geom) WHERE statut_admin = 'Actif' AND est_siege = true"],
    ['idx_geom_diffusible',   'CREATE INDEX IF NOT EXISTS idx_geom_diffusible   ON establishments USING GIST (geom) WHERE diffusible = true'],
  ]

  for (const [name, sql] of indexes) {
    process.stdout.write(`  Building ${name}... `)
    const t = Date.now()
    await client.query(sql)
    console.log(`done (${((Date.now() - t) / 1000).toFixed(1)}s)`)
  }

  console.log('\n✓ Migration complete.')
  await client.end()
}

run().catch((err) => {
  console.error('\n✗ Fatal error:', err.message)
  process.exit(1)
})
