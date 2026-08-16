import { defineConfig, devices } from '@playwright/test';

/**
 * Drives the storefront against a running shop API (which also serves the
 * production Angular bundle at /shop/). Start it with:
 *
 *   docker run --rm -d -e POSTGRES_PASSWORD=orbit123 -e POSTGRES_USER=orbit \
 *     -e POSTGRES_DB=orbit -p 55432:5432 postgres:17-alpine
 *   DATABASE_URL=postgres://orbit:orbit123@localhost:55432/shop \
 *   BOOTSTRAP_DATABASE_URL=postgres://orbit:orbit123@localhost:55432/postgres \
 *     node ../api/src/index.js
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:4000',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
