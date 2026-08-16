/**
 * Drives a REAL Orbit wallet debit through the UI against the live Spring
 * backend — unlike orbit-wallet.spec.ts, nothing here is stubbed.
 *
 * Requires the full production-shaped stack (db + orbit app + shop + nginx) and
 * an ACTIVE Orbit user with a funded wallet. Skipped unless ORBIT_LIVE_USER is set:
 *
 *   E2E_BASE_URL=http://localhost:18088 \
 *   ORBIT_LIVE_USER=bazaar.tester ORBIT_LIVE_PASS=Passw0rd123 \
 *     npx playwright test e2e/orbit-live.spec.ts
 */
import { test, expect } from '@playwright/test';

const USER = process.env['ORBIT_LIVE_USER'];
const PASS = process.env['ORBIT_LIVE_PASS'];

test.skip(!USER || !PASS, 'set ORBIT_LIVE_USER and ORBIT_LIVE_PASS to run the live wallet test');

test('pays a real order from a real Orbit wallet', async ({ page }) => {
  const unique = Date.now().toString(36);

  await page.goto('/shop/register');
  await page.getByLabel('Full name').fill('Live Wallet Buyer');
  await page.getByLabel('Email address').fill(`live.${unique}@orbit.test`);
  await page.getByLabel('Password', { exact: true }).fill('orbit-bazaar-2026');
  await page.getByRole('button', { name: 'Create account' }).click();
  // Wait for the redirect, not the button — navigating early cancels the in-flight
  // request and the session token never lands in localStorage.
  await page.waitForURL('**/shop/');
  await expect(page.getByText('Account created')).toBeVisible();

  // Cheapest in-stock item keeps the debit small so the wallet survives reruns.
  await page.goto('/shop/search?sort=price_asc&inStock=true');
  await page.locator('ob-product-card h3 a').first().click();
  await expect(page.locator('ob-gallery')).toBeVisible();
  await page.getByRole('button', { name: 'Add to cart', exact: true }).first().click();
  await expect(page.locator('header a[href="/shop/cart"] span').first()).toContainText('1');

  await page.goto('/shop/cart');
  await page.getByRole('button', { name: /Proceed to checkout/ }).click();

  await page.getByLabel("Recipient's full name").fill('Live Wallet Buyer');
  await page.getByLabel('Mobile number').fill('01012345678');
  await page.getByLabel('Street address').fill('12 Talaat Harb Street');
  await page.getByLabel('City / district').fill('Downtown');
  await page.getByLabel('Governorate').selectOption('Cairo');
  await page.getByRole('button', { name: 'Save address' }).click();

  await page.getByRole('button', { name: /Continue to delivery/ }).click();
  await page.getByRole('button', { name: /Continue to payment/ }).click();
  await page.getByRole('button', { name: /Orbit E-Wallet/ }).click();
  await page.getByRole('button', { name: /Review your order/ }).click();
  await page.getByRole('button', { name: /Place order and sign in to Orbit/ }).click();

  await expect(page.getByRole('heading', { name: 'Sign in to your wallet' })).toBeVisible();
  await page.getByLabel('Orbit username').fill(USER!);
  await page.getByLabel('Orbit password').fill(PASS!);
  await page.getByRole('button', { name: /Continue to confirm/ }).click();

  // Step 2 proves the real backend minted a token: masked name + live expiry countdown.
  await expect(page.getByRole('heading', { name: 'Confirm the payment' })).toBeVisible();
  await expect(page.locator('ob-countdown')).toBeVisible();
  await expect(page.locator('ob-orbit-payment')).toContainText('•');

  await page.getByRole('button', { name: /Confirm payment of/ }).click();

  await expect(page.getByRole('heading', { name: 'Payment complete' })).toBeVisible({
    timeout: 30_000,
  });
  const confirmation = page.locator('ob-confirmation');
  await expect(confirmation).toContainText('Orbit E-Wallet');
  await expect(confirmation).toContainText(/OB-\d{4}-\d{6}/);
  // The real backend's reference format, not the stub's ORB-XXXXXXXX.
  await expect(confirmation).toContainText(/TXN-\d{17}-\d{6}/);

  await page.goto('/shop/orders');
  await expect(page.locator('ob-orders')).toContainText('Paid');
});
