import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/**
 * End-to-end walkthrough of the storefront against a live API + Postgres.
 *
 * home → category → filter → product → add to cart → register → checkout →
 * pay with 4242 4242 4242 4242 → confirmation.
 *
 * Screenshots land in `.screenshots/`.
 */

const SHOTS = '.screenshots';
const UNIQUE = Date.now();

mkdirSync(SHOTS, { recursive: true });

/** Remote CDN photos make the page look half-loaded in a screenshot. */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.evaluate(async () => {
    await Promise.all(
      Array.from(document.images)
        .filter((img) => !img.complete)
        .map(
          (img) =>
            new Promise<void>((resolve) => {
              img.addEventListener('load', () => resolve(), { once: true });
              img.addEventListener('error', () => resolve(), { once: true });
              setTimeout(resolve, 4000);
            }),
        ),
    );
  });
  await page.waitForTimeout(400);
}

test('shopper can browse, filter, register and pay by card', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  /* ------------------------------------------------------------- home --- */
  await page.goto('/shop/');
  await expect(page.getByRole('heading', { name: 'Shop by department' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Deals of the day' })).toBeVisible();
  // Scroll once so the @defer(on viewport) rails render before the shot.
  await page.mouse.wheel(0, 1200);
  await page.waitForTimeout(600);
  await page.mouse.wheel(0, -1200);
  await settle(page);
  await page.screenshot({ path: `${SHOTS}/01-home.png`, fullPage: false });
  await page.screenshot({ path: `${SHOTS}/01-home-full.png`, fullPage: true });

  /* --------------------------------------------------------- category --- */
  await page.goto('/shop/c/audio-headphones');
  await expect(page.getByRole('heading', { name: 'Audio & Headphones' })).toBeVisible();
  // The heading renders from the catalog signal, but the grid waits on a separate
  // /products request — so count() straight after the heading races the fetch.
  await expect(page.locator('ob-product-card').first()).toBeVisible();
  const unfiltered = await page.locator('ob-product-card').count();
  expect(unfiltered).toBeGreaterThan(0);

  /* ----------------------------------------------------------- filter --- */
  // Star-rating facet: filters must land in the URL.
  await page.getByRole('button', { name: /& up/ }).first().click();
  await page.waitForURL(/minRating=/);
  await expect(page.locator('ob-filter-sidebar')).toBeVisible();

  // Brand facet.
  const brandBox = page.locator('ob-filter-sidebar input[type="checkbox"]').first();
  await brandBox.check();
  await page.waitForURL(/brand=/);

  // Sort, also in the URL.
  await page.getByLabel('Sort results').selectOption('price_asc');
  await page.waitForURL(/sort=price_asc/);

  await expect(page.getByText('Clear all')).toBeVisible();
  await settle(page);
  await page.screenshot({ path: `${SHOTS}/02-category-filtered.png`, fullPage: false });
  await page.screenshot({ path: `${SHOTS}/02-category-filtered-full.png`, fullPage: true });

  // Back/forward must walk the filter history.
  const filteredUrl = page.url();
  await page.goBack();
  await expect(page).not.toHaveURL(filteredUrl);
  await page.goForward();
  await expect(page).toHaveURL(filteredUrl);

  /* ---------------------------------------------------------- product --- */
  await page.locator('ob-product-card h3 a').first().click();
  await page.waitForURL(/\/shop\/p\//);
  await expect(page.locator('ob-gallery')).toBeVisible();
  await expect(page.getByRole('tab', { name: /Specifications/ })).toBeVisible();

  // Tabs work.
  await page.getByRole('tab', { name: /Specifications/ }).click();
  await expect(page.locator('#panel-specifications')).toBeVisible();
  await page.getByRole('tab', { name: /Reviews/ }).click();
  await expect(page.locator('#panel-reviews')).toBeVisible();
  await page.getByRole('tab', { name: 'Description' }).click();

  await settle(page);
  await page.screenshot({ path: `${SHOTS}/03-product.png`, fullPage: false });
  await page.screenshot({ path: `${SHOTS}/03-product-full.png`, fullPage: true });

  /* ------------------------------------------------------ add to cart --- */
  await page.getByRole('button', { name: 'Add to cart', exact: true }).first().click();
  await expect(page.getByText('Added to cart')).toBeVisible();
  // Guest cart badge updates from localStorage.
  await expect(page.locator('header a[href="/shop/cart"] span').first()).toContainText('1');

  const guestCart = await page.evaluate(() => localStorage.getItem('ob.cart'));
  expect(guestCart, 'guest cart persists under ob.cart').toContain('productId');

  /* --------------------------------------------------------- register --- */
  await page.goto('/shop/register');
  await page.getByLabel('Full name').fill('Omar Hassan');
  await page.getByLabel('Email address').fill(`omar.${UNIQUE}@orbit.test`);
  await page.getByLabel('Password', { exact: true }).fill('orbit-bazaar-2026');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/shop/');
  await expect(page.getByText('Account created')).toBeVisible();

  // The guest cart merged into the account cart.
  await expect(page.locator('header a[href="/shop/cart"] span').first()).toContainText('1');
  const afterMerge = await page.evaluate(() => localStorage.getItem('ob.cart'));
  expect(afterMerge, 'guest cart is cleared after merge').toBe('[]');

  /* ------------------------------------------------------------- cart --- */
  await page.goto('/shop/cart');
  await expect(page.getByRole('heading', { name: 'Your cart', exact: true })).toBeVisible();
  await expect(page.getByText('VAT (14%)')).toBeVisible();
  await settle(page);
  await page.screenshot({ path: `${SHOTS}/04-cart.png`, fullPage: false });

  /* --------------------------------------------------------- checkout --- */
  await page.getByRole('button', { name: /Proceed to checkout/ }).click();
  await page.waitForURL('**/shop/checkout');

  // Step 1 — no saved address yet, so the form opens automatically.
  await page.getByLabel("Recipient's full name").fill('Omar Hassan');
  await page.getByLabel('Mobile number').fill('01012345678');
  await page.getByLabel('Street address').fill('12 Talaat Harb Street');
  await page.getByLabel('City / district').fill('Downtown');
  await page.getByLabel('Governorate').selectOption('Cairo');
  await page.getByRole('button', { name: 'Save address' }).click();
  await expect(page.getByText('Address saved')).toBeVisible();

  await page.getByRole('button', { name: /Continue to delivery/ }).click();

  // Step 2 — delivery speed.
  await expect(page.getByRole('heading', { name: 'Delivery speed' })).toBeVisible();
  await page.getByRole('button', { name: /Continue to payment/ }).click();

  // Step 3 — payment method + card details.
  await expect(page.getByRole('heading', { name: /How would you like to pay/ })).toBeVisible();

  // The test-cards helper panel must be discoverable.
  await page.getByRole('button', { name: /Test cards/ }).click();
  await expect(page.getByText('4242 4242 4242 4242')).toBeVisible();
  await settle(page);
  await page.screenshot({ path: `${SHOTS}/05-checkout-payment.png`, fullPage: false });
  await page.screenshot({ path: `${SHOTS}/05-checkout-payment-full.png`, fullPage: true });

  // Client-side Luhn rejects a bad PAN before anything is submitted.
  await page.getByLabel('Card number').fill('4242424242424241');
  await page.getByLabel('Card number').blur();
  await expect(page.getByText("That card number doesn't look right")).toBeVisible();

  await page.getByLabel('Card number').fill('4242424242424242');
  await page.getByLabel('Name on card').fill('OMAR HASSAN');
  await page.getByLabel('Expires').fill('1230');
  await page.getByLabel(/Security code/).fill('123');
  await expect(page.getByText("That card number doesn't look right")).toBeHidden();

  await page.getByRole('button', { name: /Review your order/ }).click();

  // Step 4 — review, then pay.
  await expect(page.getByText('Delivering to')).toBeVisible();
  await settle(page);
  await page.screenshot({ path: `${SHOTS}/06-checkout-review.png`, fullPage: true });

  await page.getByRole('button', { name: /^Pay EGP/ }).click();

  /* ----------------------------------------------------- confirmation --- */
  await expect(page.getByRole('heading', { name: 'Payment complete' })).toBeVisible({
    timeout: 25_000,
  });
  await expect(page.locator('ob-confirmation')).toContainText(/JS-\d{4}-\d{6}/);
  await expect(page.locator('ob-confirmation')).toContainText('Visa ending 4242');
  await settle(page);
  await page.screenshot({ path: `${SHOTS}/07-confirmation.png`, fullPage: true });

  /* ---------------------------------------------------------- orders --- */
  await page.goto('/shop/orders');
  await expect(page.getByRole('heading', { name: 'Your orders' })).toBeVisible();
  await expect(page.locator('ob-orders')).toContainText('Paid');

  await page.locator('a:has-text("View order")').first().click();
  await page.waitForURL(/\/shop\/orders\/[0-9a-f-]{36}/);
  await expect(page.getByText('Payment summary')).toBeVisible();
  await expect(page.getByText(/Visa ending 4242/)).toBeVisible();
  await settle(page);
  await page.screenshot({ path: `${SHOTS}/08-order-detail.png`, fullPage: true });

  // The cart is emptied by the server on settlement (CONTRACT §6).
  await page.goto('/shop/cart');
  await expect(page.getByText('Your cart is empty')).toBeVisible();

  expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toEqual([]);
});

test('search suggestions, wishlist and not-found all work', async ({ page }) => {
  await page.goto('/shop/');

  /* ------------------------------------------------- search suggest --- */
  const search = page.locator('.lg\\:block > ob-search-bar input[type="search"]').first();
  await search.fill('laptop');
  await expect(page.locator('#ob-search-suggestions')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#ob-search-suggestions li').first()).toBeVisible();
  const suggestions = await page.locator('#ob-search-suggestions li').count();
  expect(suggestions).toBeGreaterThan(0);
  expect(suggestions).toBeLessThanOrEqual(6);
  await page.screenshot({ path: `${SHOTS}/09-search-suggestions.png` });

  await search.press('Enter');
  await page.waitForURL(/\/shop\/search\?q=laptop/);
  await expect(page.locator('ob-product-card').first()).toBeVisible();

  /* ------------------------------------------------- wishlist guard --- */
  await page.goto('/shop/wishlist');
  await page.waitForURL(/\/shop\/login/);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();

  /* ---------------------------------------------------- not found --- */
  await page.goto('/shop/this-route-does-not-exist');
  await expect(page.getByText('This page has gone down a mouse hole')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/10-not-found.png` });
});

test('card declines are mapped to specific messages', async ({ page }) => {
  await page.goto('/shop/');

  // Seed a cart and an account straight through the API — this test is about
  // the decline path, not about repeating the whole funnel.
  const email = `decline.${UNIQUE}@orbit.test`;
  const token = await page.evaluate(async (userEmail) => {
    const register = await fetch('/shop/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Decline Tester', email: userEmail, password: 'orbit-bazaar-2026' }),
    });
    const { token } = await register.json();

    const products = await fetch('/shop/api/products?pageSize=1&inStock=true').then((r) => r.json());
    await fetch('/shop/api/cart/items', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ productId: products.items[0].id, qty: 1 }),
    });
    await fetch('/shop/api/addresses', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        fullName: 'Decline Tester',
        phone: '01012345678',
        line1: '1 Test Street',
        city: 'Giza',
        governorate: 'Giza',
        isDefault: true,
      }),
    });
    localStorage.setItem('ob.token', token);
    return token as string;
  }, email);
  expect(token).toBeTruthy();

  await page.goto('/shop/checkout');
  await page.getByRole('button', { name: /Continue to delivery/ }).click();
  await page.getByRole('button', { name: /Continue to payment/ }).click();

  await page.getByLabel('Card number').fill('4000000000000002');
  await page.getByLabel('Name on card').fill('DECLINE TESTER');
  await page.getByLabel('Expires').fill('1230');
  await page.getByLabel(/Security code/).fill('123');
  await page.getByRole('button', { name: /Review your order/ }).click();
  await page.getByRole('button', { name: /^Pay EGP/ }).click();

  await expect(page.getByText('Your card was declined', { exact: true })).toBeVisible({
    timeout: 25_000,
  });
  await expect(page.getByText(/declined by the issuer/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Pay with Orbit instead/ })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/11-card-declined.png`, fullPage: true });
});
