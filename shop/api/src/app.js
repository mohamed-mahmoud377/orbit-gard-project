import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { query } from './db/pool.js';
import { logger } from './lib/logger.js';
import { notFoundHandler, errorHandler } from './middleware/error.js';
import { optionalAuth } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';
import { catalogRouter } from './routes/catalog.js';
import { cartRouter } from './routes/cart.js';
import { wishlistRouter } from './routes/wishlist.js';
import { addressesRouter } from './routes/addresses.js';
import { reviewsRouter } from './routes/reviews.js';
import { ordersRouter } from './routes/orders.js';
import { homeRouter } from './routes/home.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1); // sits behind nginx
  app.disable('x-powered-by');
  app.use(
    helmet({
      // The Angular bundle loads product photography from a CDN, so the default
      // `img-src 'self'` would blank the whole storefront.
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'img-src': ["'self'", 'data:', 'https:'],
          'connect-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'"],
          'frame-ancestors': ["'none'"],
          'upgrade-insecure-requests': null,
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(express.json({ limit: '256kb' }));

  // ------------------------------------------------------------ /shop/api ---
  const api = express.Router();

  api.get('/health', async (_req, res) => {
    let db = 'down';
    let products = 0;
    try {
      const { rows } = await query('SELECT count(*)::bigint AS n FROM products');
      products = Number(rows[0].n);
      db = 'up';
    } catch (err) {
      logger.error('health check could not reach the database', { message: err.message });
    }
    res.status(db === 'up' ? 200 : 503).json({ status: db === 'up' ? 'ok' : 'degraded', db, catalog: { products } });
  });

  api.use(optionalAuth);
  api.use('/auth', authRouter);
  api.use('/cart', cartRouter);
  api.use('/wishlist', wishlistRouter);
  api.use('/addresses', addressesRouter);
  api.use('/orders', ordersRouter);
  api.use(homeRouter);
  api.use(reviewsRouter); // /products/:slug/reviews — before the catalog router
  api.use(catalogRouter);

  api.use(notFoundHandler);
  app.use('/shop/api', api);

  // ------------------------------------------------- Angular static bundle ---
  const distDir = path.resolve(config.webDist);
  const indexHtml = path.join(distDir, 'index.html');
  const haveBundle = fs.existsSync(indexHtml);

  if (haveBundle) {
    // Hashed build artefacts are immutable; index.html must never be cached or
    // a deploy leaves browsers pointing at files that no longer exist.
    app.use(
      '/shop',
      express.static(distDir, {
        index: false,
        maxAge: '1y',
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html')) res.setHeader('cache-control', 'no-cache');
        },
      }),
    );
    // SPA fallback for every non-API path under /shop/.
    app.get(/^\/shop(\/(?!api\/).*)?$/, (_req, res) => {
      res.setHeader('cache-control', 'no-cache');
      res.sendFile(indexHtml);
    });
  } else {
    logger.warn('Angular bundle not found — serving the API only', { expected: distDir });
    app.get(/^\/shop(\/(?!api\/).*)?$/, (_req, res) =>
      res.status(503).json({
        error: {
          code: 'WEB_BUNDLE_MISSING',
          message: 'The storefront bundle has not been built yet.',
        },
      }),
    );
  }

  app.get('/', (_req, res) => res.redirect(302, '/shop/'));

  app.use((req, res) =>
    res.status(404).json({ error: { code: 'NOT_FOUND', message: `No such path: ${req.method} ${req.originalUrl}` } }),
  );
  app.use(errorHandler);

  return app;
}
