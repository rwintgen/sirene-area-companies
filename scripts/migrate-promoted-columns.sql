-- Migration: promote frequently-queried JSONB fields to real indexed columns.
-- Run this ONCE against your existing database instead of re-importing the full CSV.
-- Estimated time: ~5–15 minutes for 14M rows on a standard Cloud SQL instance.
--
-- Usage:
--   psql $DATABASE_URL -f scripts/migrate-promoted-columns.sql

BEGIN;

-- Step 1: Add new columns (safe to run multiple times — IF NOT EXISTS)
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
  ADD COLUMN IF NOT EXISTS mission            TEXT;

-- Step 2: Backfill all rows from JSONB
UPDATE establishments SET
  statut_admin      = fields->>'Etat administratif de l''établissement',
  statut_admin_ul   = fields->>'Etat administratif de l''unité légale',
  date_fermeture    = fields->>'Date de fermeture de l''établissement',
  date_fermeture_ul = fields->>'Date de fermeture de l''unité légale',
  est_siege         = (fields->>'Etablissement siège') = 'oui',
  diffusible        = (fields->>'Statut de diffusion de l''établissement') = 'O',
  ape_code          = fields->>'Activité principale de l''établissement',
  naf_division      = CASE
                        WHEN (fields->>'Activité principale de l''établissement') ~ '^\d{2}'
                        THEN CAST(SUBSTRING(fields->>'Activité principale de l''établissement', 1, 2) AS SMALLINT)
                      END,
  legal_form        = fields->>'Catégorie juridique de l''unité légale',
  assoc_id          = fields->>'Identifiant association de l''unité légale',
  categorie_ent     = fields->>'Catégorie de l''entreprise',
  employeur         = fields->>'Caractère employeur de l''établissement',
  tranche_eff_sort  = CAST(NULLIF(fields->>'Tranche de l''effectif de l''établissement triable', '') AS INTEGER),
  ess               = fields->>'Economie sociale et solidaire unité légale',
  mission           = fields->>'Société à mission unité légale';

COMMIT;

-- Step 3: Build indexes (outside transaction — CREATE INDEX can't run inside one on large tables)
CREATE INDEX IF NOT EXISTS idx_est_statut_admin ON establishments (statut_admin);
CREATE INDEX IF NOT EXISTS idx_est_ape_code     ON establishments (ape_code);
CREATE INDEX IF NOT EXISTS idx_est_naf_div      ON establishments (naf_division);
CREATE INDEX IF NOT EXISTS idx_est_legal_form   ON establishments (legal_form);
CREATE INDEX IF NOT EXISTS idx_est_categorie    ON establishments (categorie_ent);
CREATE INDEX IF NOT EXISTS idx_est_employeur    ON establishments (employeur);

CREATE INDEX IF NOT EXISTS idx_geom_active
  ON establishments USING GIST (geom) WHERE statut_admin = 'Actif';
CREATE INDEX IF NOT EXISTS idx_geom_active_siege
  ON establishments USING GIST (geom) WHERE statut_admin = 'Actif' AND est_siege = true;
CREATE INDEX IF NOT EXISTS idx_geom_diffusible
  ON establishments USING GIST (geom) WHERE diffusible = true;
