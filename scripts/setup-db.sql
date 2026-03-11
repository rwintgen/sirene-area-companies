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

-- Connector data: user-uploaded rows with lat/lon geom and arbitrary JSON fields
CREATE TABLE IF NOT EXISTS connector_rows (
  id            SERIAL PRIMARY KEY,
  connector_id  TEXT NOT NULL,
  org_id        TEXT NOT NULL,
  lat           DOUBLE PRECISION NOT NULL,
  lon           DOUBLE PRECISION NOT NULL,
  geom          GEOMETRY(Point, 4326) NOT NULL,
  fields        JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_connector_rows_connector
  ON connector_rows (connector_id);

CREATE INDEX IF NOT EXISTS idx_connector_rows_geom
  ON connector_rows USING GIST (geom);
