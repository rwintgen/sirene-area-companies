CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS establishments (
  id       SERIAL PRIMARY KEY,
  siret    VARCHAR(14) UNIQUE,
  lat      DOUBLE PRECISION NOT NULL,
  lon      DOUBLE PRECISION NOT NULL,
  geom     GEOMETRY(Point, 4326) NOT NULL,
  fields   JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_establishments_geom
  ON establishments USING GIST (geom);

CREATE INDEX IF NOT EXISTS idx_establishments_siret
  ON establishments (siret);

CREATE INDEX IF NOT EXISTS idx_establishments_fields
  ON establishments USING GIN (fields jsonb_path_ops);
