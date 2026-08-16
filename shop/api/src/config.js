import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const num = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const bool = (v, fallback) => (v === undefined ? fallback : /^(1|true|yes|on)$/i.test(String(v)));

export const config = {
  port: num(process.env.PORT, 4000),
  databaseUrl: process.env.DATABASE_URL,
  bootstrapDatabaseUrl: process.env.BOOTSTRAP_DATABASE_URL,
  orbitApiBase: (process.env.ORBIT_API_BASE || 'http://app:8080/api/v1').replace(/\/+$/, ''),
  orbitMerchantName: (process.env.ORBIT_MERCHANT_NAME || "Jerry's Shop").slice(0, 255),
  orbitTimeoutMs: num(process.env.ORBIT_TIMEOUT_MS, 15000),
  jwtSecret: process.env.JWT_SECRET || 'dev-only-insecure-shop-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',
  seedOnBoot: bool(process.env.SEED_ON_BOOT, true),
  logLevel: process.env.LOG_LEVEL || 'info',
  bcryptRounds: num(process.env.BCRYPT_ROUNDS, 10),
  webDist: process.env.SHOP_WEB_DIST || path.resolve(here, '../../web/dist/web/browser'),
  catalogPath: process.env.CATALOG_PATH || path.resolve(here, 'catalog/catalog.json'),
  /** Card processor artificial latency window (CONTRACT §7). */
  cardLatencyMinMs: num(process.env.CARD_LATENCY_MIN_MS, 800),
  cardLatencyMaxMs: num(process.env.CARD_LATENCY_MAX_MS, 1500),
  isProd: process.env.NODE_ENV === 'production',
};

export const SHIPPING = {
  FREE_THRESHOLD_CENTS: 100000,
  STANDARD_CENTS: 5000,
  EXPRESS_CENTS: 15000,
};

export const TAX_BASIS_POINTS = 1400; // 14% VAT
