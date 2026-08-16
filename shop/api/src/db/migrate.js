import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool } from './pool.js';
import { logger } from '../lib/logger.js';

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/**
 * Forward-only migration runner. Each `.sql` file in `migrations/` is applied
 * once, in filename order, inside its own transaction, and recorded in
 * `schema_migrations`. An advisory lock keeps two booting replicas from racing.
 *
 * @returns {Promise<string[]>} the filenames applied during this run
 */
export async function runMigrations() {
  const pool = getPool();
  const client = await pool.connect();
  const applied = [];

  try {
    // 8425 = arbitrary, stable app id. Held for the whole run, released with the session.
    await client.query('SELECT pg_advisory_lock(8425, 1)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename    text PRIMARY KEY,
        applied_at  timestamptz NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await client.query('SELECT filename FROM schema_migrations');
    const done = new Set(rows.map((r) => r.filename));

    const files = (await fs.readdir(migrationsDir))
      .filter((f) => f.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b, 'en'));

    for (const filename of files) {
      if (done.has(filename)) continue;
      const sql = await fs.readFile(path.join(migrationsDir, filename), 'utf8');
      const startedAt = Date.now();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(`migration ${filename} failed: ${err.message}`, { cause: err });
      }
      applied.push(filename);
      logger.info('migration applied', { filename, ms: Date.now() - startedAt });
    }

    if (applied.length === 0) logger.info('schema up to date', { migrations: files.length });
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock(8425, 1)').catch(() => {});
    client.release();
  }
}
