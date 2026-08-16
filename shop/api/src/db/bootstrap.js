import pg from 'pg';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

const { Client } = pg;

/**
 * Postgres error codes we treat as "someone else already did it".
 *  42P04 duplicate_database
 *  23505 unique_violation (pg_database_datname_index, when two replicas race)
 *  55006 object_in_use    (concurrent CREATE DATABASE on the same template)
 */
const BENIGN = new Set(['42P04', '23505', '55006']);

/** @param {string} url */
function databaseNameFrom(url) {
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  if (!name) throw new Error(`DATABASE_URL has no database name: ${url.replace(/:[^:@/]*@/, ':***@')}`);
  return name;
}

/**
 * The Postgres volume on the server already exists, so docker-entrypoint-initdb.d
 * never runs and the `shop` database is simply missing. Connect to the maintenance
 * database and create it. Idempotent, and safe when two replicas boot together.
 *
 * @param {{ databaseUrl?: string, bootstrapUrl?: string }} [opts]
 * @returns {Promise<{ created: boolean, skipped?: string }>}
 */
export async function ensureDatabase(opts = {}) {
  const databaseUrl = opts.databaseUrl ?? config.databaseUrl;
  const bootstrapUrl = opts.bootstrapUrl ?? config.bootstrapDatabaseUrl;

  if (!databaseUrl) throw new Error('DATABASE_URL is not set.');
  if (!bootstrapUrl) {
    logger.warn('BOOTSTRAP_DATABASE_URL not set — assuming the shop database already exists');
    return { created: false, skipped: 'no-bootstrap-url' };
  }

  const dbName = databaseNameFrom(databaseUrl);
  const client = new Client({
    connectionString: bootstrapUrl,
    connectionTimeoutMillis: 10_000,
    application_name: 'orbit-shop-bootstrap',
  });

  try {
    await client.connect();
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (rowCount > 0) {
      logger.info('database already present', { database: dbName });
      return { created: false };
    }
    // CREATE DATABASE cannot be parameterised or run inside a transaction.
    await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
    logger.info('database created', { database: dbName });
    return { created: true };
  } catch (err) {
    if (BENIGN.has(err.code)) {
      logger.info('database created concurrently by another instance', { database: dbName, code: err.code });
      return { created: false };
    }
    throw err;
  } finally {
    await client.end().catch(() => {});
  }
}
