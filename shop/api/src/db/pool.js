import pg from 'pg';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

const { Pool, types } = pg;

// int8 (bigint) comes back as a string by default. Every bigint we select is a
// count or a cents amount that comfortably fits in a double, so parse it.
types.setTypeParser(types.builtins.INT8, (v) => (v === null ? null : Number(v)));
// numeric -> Number for `rating` (numeric(2,1)).
types.setTypeParser(types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)));

/** @type {import('pg').Pool | null} */
let pool = null;

export function getPool() {
  if (pool) return pool;
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is not set — the shop API cannot start without it.');
  }
  pool = new Pool({
    connectionString: config.databaseUrl,
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: 'orbit-shop-api',
  });
  pool.on('error', (err) => logger.error('idle pg client error', { message: err.message }));
  return pool;
}

/**
 * @param {string} text
 * @param {unknown[]} [params]
 */
export function query(text, params) {
  return getPool().query(text, params);
}

/**
 * Run `fn` inside a single transaction on a dedicated client.
 * Rolls back and rethrows on any error.
 * @template T
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      logger.error('rollback failed', { message: rollbackErr.message });
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end();
  }
}
