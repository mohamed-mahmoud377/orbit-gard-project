import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/**
 * Orbit E-Wallet payment (CONTRACT §8), driven against the stub Orbit backend
 * in `e2e/orbit-stub.mjs`. Requires the shop API to be started with
 * `ORBIT_API_BASE=http://localhost:8080/api/v1` and a short `ORBIT_TIMEOUT_MS`
 * so the uncertain case doesn't take fifteen seconds.
 */

const SHOTS = '.screenshots';
mkdirSync(SHOTS, { recursive: true });

/** Seed an account with one cart line and a default address, via the API. */
async function seedCheckout(page: Page, label: string): Promise<void> {
  await page.goto('/shop/');
  await page.evaluate(async (tag) => {
    const register = await fetch('/shop/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Wallet Tester',
        email: `wallet.${tag}.${Date.now()}@orbit.test`,
        password: 'orbit-bazaar-2026',
      }),
    });
    const { token } = await register.json();
    const auth = { 'content-type': 'application/json', authorization: `Bearer ${token}` };

    const products = await fetch('/shop/api/products?pageSize=1&inStock=true').then((r) => r.json());
    await fetch('/shop/api/cart/items', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ productId: products.items[0].id, qty: 1 }),
    });
    await fetch('/shop/api/addresses', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        fullName: 'Wallet Tester',
        phone: '01012345678',
        line1: '9 Orbit Street',
        city: 'Maadi',
        governorate: 'Cairo',
        isDefault: true,
      }),
    });
    localStorage.setItem('ob.token', token);
  }, label);
}

/** Walk Address → Delivery → Payment(Orbit) → Review and place the order. */
async function reachWalletStep(page: Page): Promise<void> {
  await page.goto('/shop/checkout');
  await page.getByRole('button', { name: /Continue to delivery/ }).click();
  await page.getByRole('button', { name: /Continue to payment/ }).click();
  await page.getByRole('button', { name: /Orbit E-Wallet/ }).click();
  await page.getByRole('button', { name: /Review your order/ }).click();
  await page.getByRole('button', { name: /Place order and sign in to Orbit/ }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to your wallet' })).toBeVisible();
}

async function signIn(page: Page, username: string): Promise<void> {
  await page.getByLabel('Orbit username').fill(username);
  await page.getByLabel('Orbit password').fill('wallet-pass');
  await page.getByRole('button', { name: /Continue to confirm/ }).click();
}

test('wallet happy path: verify, confirm, receipt shows the Orbit reference', async ({ page }) => {
  await seedCheckout(page, 'good');
  await reachWalletStep(page);
  await signIn(page, 'orbit.good');

  // Step B: masked username, amount and a session-expiry countdown.
  await expect(page.getByRole('heading', { name: 'Confirm the payment' })).toBeVisible();
  // maskUsername('orbit.good') -> 'or' + 6 bullets + 'od'
  await expect(page.locator('ob-orbit-payment')).toContainText(/^.*or•+od.*$/s);
  await expect(page.getByText('Session expires in')).toBeVisible();
  await expect(page.locator('ob-countdown')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/12-orbit-confirm.png`, fullPage: true });

  // The password is posted exactly once and never kept.
  const stored = await page.evaluate(() => JSON.stringify(localStorage));
  expect(stored).not.toContain('wallet-pass');
  expect(stored).not.toContain('orbit.good');

  await page.getByRole('button', { name: /Confirm payment of/ }).click();

  await expect(page.getByRole('heading', { name: 'Payment complete' })).toBeVisible({
    timeout: 25_000,
  });
  await expect(page.locator('ob-confirmation')).toContainText('Orbit E-Wallet');
  await expect(page.locator('ob-confirmation')).toContainText(/ORB-[0-9A-F]{8}/);
  await expect(page.locator('ob-confirmation')).toContainText('Orbit transaction ID');
  await page.screenshot({ path: `${SHOTS}/13-orbit-confirmation.png`, fullPage: true });
});

test('wrong wallet credentials send the shopper back to step A', async ({ page }) => {
  await seedCheckout(page, 'badpass');
  await reachWalletStep(page);
  await signIn(page, 'orbit.badpass');

  await expect(page.getByText('Those Orbit details were not accepted')).toBeVisible();
  await expect(page.getByText('Wrong Orbit username or password.')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/14-orbit-bad-credentials.png`, fullPage: true });

  await page.getByRole('button', { name: /Enter wallet details again/ }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to your wallet' })).toBeVisible();
});

test('insufficient balance keeps the session and offers a retry or the card', async ({ page }) => {
  await seedCheckout(page, 'broke');
  await reachWalletStep(page);
  await signIn(page, 'orbit.broke');
  await page.getByRole('button', { name: /Confirm payment of/ }).click();

  await expect(page.getByText('Not enough balance in your wallet')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/doesn't have enough balance/)).toBeVisible();
  await expect(page.getByText(/Top the wallet up in the Orbit app/)).toBeVisible();
  // Orbit rejected before redeeming the token, so the same session is reusable.
  await expect(page.getByRole('button', { name: /Try the payment again/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Pay by card instead/ })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/15-orbit-insufficient-balance.png`, fullPage: true });
});

test('daily limit is explained, not shown as a generic failure', async ({ page }) => {
  await seedCheckout(page, 'daily');
  await reachWalletStep(page);
  await signIn(page, 'orbit.daily');
  await page.getByRole('button', { name: /Confirm payment of/ }).click();

  await expect(page.getByText('This would exceed your daily limit')).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(/daily spending limit/)).toBeVisible();
  await expect(page.getByText(/raise the limit in the Orbit app/i)).toBeVisible();
});

/**
 * The one that matters most: a timeout after the pay request was on the wire.
 * It must render amber, must not claim failure, and must not offer a retry.
 */
test('ORBIT_UNCERTAIN renders as a warning with no retry offered', async ({ page }) => {
  await seedCheckout(page, 'ghost');
  await reachWalletStep(page);
  await signIn(page, 'orbit.ghost');
  await page.getByRole('button', { name: /Confirm payment of/ }).click();

  const fault = page.locator('ob-orbit-payment [role="alert"]');
  await expect(fault).toBeVisible({ timeout: 30_000 });
  await expect(fault).toContainText('We lost contact with Orbit mid-payment');
  await expect(fault).toContainText('on hold');
  await expect(fault).toContainText(/check your Orbit transactions/i);

  // Amber, not red.
  await expect(fault).toHaveClass(/bg-warn-soft/);
  await expect(fault).not.toHaveClass(/bg-pop-soft/);

  // CONTRACT §8: no one-click retry for this order.
  await expect(page.getByRole('button', { name: /Try the payment again/ })).toBeHidden();
  await expect(page.getByRole('button', { name: /Enter wallet details again/ })).toBeHidden();
  await expect(page.getByRole('button', { name: /^Retry$/ })).toBeHidden();
  await expect(page.getByRole('button', { name: /Pay by card instead/ })).toBeHidden();
  await expect(page.getByRole('link', { name: /View this order/ })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/16-orbit-uncertain.png`, fullPage: true });

  // The order itself is parked for review, and says so in amber too.
  await page.getByRole('link', { name: /View this order/ }).click();
  await page.waitForURL(/\/shop\/orders\/[0-9a-f-]{36}/);
  await expect(page.getByText('On hold — under review')).toBeVisible();
  await expect(page.getByText('Payment unconfirmed')).toBeVisible();
  await expect(page.getByText('This payment is still being confirmed')).toBeVisible();
  await expect(page.getByRole('link', { name: /Complete payment/ })).toBeHidden();
  await page.screenshot({ path: `${SHOTS}/17-order-needs-review.png`, fullPage: true });
});
