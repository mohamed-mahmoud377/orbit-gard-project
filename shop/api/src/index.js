import { config } from './config.js';
import { logger } from './lib/logger.js';
import { ensureDatabase } from './db/bootstrap.js';
import { runMigrations } from './db/migrate.js';
import { seedCatalog } from './seed/seed-catalog.js';
import { closePool } from './db/pool.js';
import { createApp } from './app.js';

async function main() {
  logger.info('orbit bazaar api starting', {
    port: config.port,
    orbitApiBase: config.orbitApiBase,
    seedOnBoot: config.seedOnBoot,
  });

  // 1. The Postgres volume on the server predates this app, so initdb scripts
  //    never ran and the `shop` database has to be created from here.
  await ensureDatabase();

  // 2. Forward-only schema.
  await runMigrations();

  // 3. Catalog. A missing catalog.json is fatal — an empty storefront is worse
  //    than a container that refuses to start and says why.
  if (config.seedOnBoot) {
    await seedCatalog();
  }

  const server = createApp().listen(config.port, () => {
    logger.info('listening', { port: config.port, web: '/shop/', api: '/shop/api' });
  });

  const shutdown = (signal) => {
    logger.info('shutting down', { signal });
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('failed to start', { message: err.message, stack: err.stack });
  process.exit(1);
});
