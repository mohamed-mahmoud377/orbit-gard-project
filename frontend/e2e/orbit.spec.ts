import { expect, test } from '@playwright/test';

test('root opens the login page', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page).toHaveURL(/\/auth\/login$/);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('parent can sign in, top up, and send money', async ({ page }) => {
  await page.goto('/auth/login');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Good evening, Mohamed/ })).toBeVisible();
  await expect(page.locator('.balance-graphic')).toBeVisible();

  await page.getByRole('link', { name: /Top up wallet/ }).click();
  await page.getByLabel('Top-up amount').fill('100');
  await page.getByRole('button', { name: 'Continue to Paymob' }).click();
  await page.getByRole('button', { name: 'Complete demo payment' }).click();
  await expect(page.getByRole('heading', { name: 'Top-up succeeded' })).toBeVisible();

  await page.getByRole('link', { name: 'Send money' }).first().click();
  await page.getByRole('button', { name: /Send EGP 200.00 to @sara/ }).click();
  await expect(page.getByRole('heading', { name: 'Money sent' })).toBeVisible();
});

test('parent can manage a child wallet', async ({ page }) => {
  await page.goto('/auth/login');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.goto('/family');
  await expect(page.getByRole('heading', { name: 'Family' })).toBeVisible();
  await expect(page.getByText('Youssef Mahmoud')).toBeVisible();
  await expect(page.getByText('Nour Mahmoud')).toBeVisible();

  await page.getByRole('link', { name: 'Add a child', exact: true }).first().click();
  await page.getByRole('button', { name: 'Create child wallet' }).click();
  await expect(page.getByRole('heading', { name: 'Child wallet created' })).toBeVisible();
});

test('child account sees the restricted wallet shell', async ({ page }) => {
  await page.goto('/auth/login');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByLabel('Username or email').fill('youssef');
  await page.getByLabel('Password').fill('Youssef@123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Hi Youssef' })).toBeVisible();
  await expect(page.getByText(/Direct top-ups and transfers are not available/)).toBeVisible();
});

test('merchant payment moves through hold and settlement', async ({ page }) => {
  await page.goto('/pay/nile-books');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.getByRole('heading', { name: 'The Yacoubian Building' })).toBeVisible();
  await page.getByRole('button', { name: 'Pay with Orbit' }).click();
  await page.getByRole('button', { name: 'Confirm payment' }).click();
  await expect(page.getByRole('heading', { name: 'Payment accepted' })).toBeVisible();
  await page.getByRole('button', { name: 'Settle demo payment' }).click();
  await expect(page.getByRole('heading', { name: 'Payment completed' })).toBeVisible();
});
