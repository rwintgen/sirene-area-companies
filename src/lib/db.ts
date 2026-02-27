import { Pool } from 'pg'
import { Connector, IpAddressTypes } from '@google-cloud/cloud-sql-connector'

let pool: Pool | null = null

/**
 * Returns a singleton PostgreSQL connection pool.
 *
 * - **Production** (`CLOUD_SQL_CONNECTION_NAME` set): connects via the
 *   Cloud SQL Node.js connector with IAM-based auth.
 * - **Local dev** (`DATABASE_URL` set): connects directly, typically
 *   through Cloud SQL Auth Proxy on localhost:5432.
 *
 * The first call verifies the connection before returning.
 */
export async function getPool(): Promise<Pool> {
  if (pool) return pool

  const instanceConnectionName = process.env.CLOUD_SQL_CONNECTION_NAME

  if (instanceConnectionName) {
    const connector = new Connector()
    const clientOpts = await connector.getOptions({
      instanceConnectionName,
      ipType: IpAddressTypes.PUBLIC,
    })
    pool = new Pool({
      ...clientOpts,
      user: process.env.DB_USER ?? 'postgres',      password: process.env.DB_PASSWORD,      database: process.env.DB_NAME ?? 'sirene_db',
      max: 5,
    })
  } else if (process.env.DATABASE_URL) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: false,
      max: 5,
    })
  } else {
    throw new Error(
      'No database configuration found. Set DATABASE_URL (local) or CLOUD_SQL_CONNECTION_NAME (production).'
    )
  }

  const client = await pool.connect()
  client.release()
  console.log('[db] Pool connected.')
  return pool
}

/** Checks whether any database connection env vars are set. */
export function isDbConfigured(): boolean {
  return !!(process.env.DATABASE_URL || process.env.CLOUD_SQL_CONNECTION_NAME)
}
