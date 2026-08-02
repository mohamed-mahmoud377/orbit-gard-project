import { expect, test } from '@playwright/test';

async function clearAuthState(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/auth/login');
  await page.evaluate(() => {
    window.localStorage.clear();
  });
  await page.reload();
}

async function signIn(
  page: import('@playwright/test').Page,
  username: string,
  password: string,
): Promise<void> {
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(username === 'youssef' ? /\/my-wallet$/ : /\/dashboard$/);
}

test('root opens the login page', async ({ page }) => {
  await clearAuthState(page);
  await expect(page).toHaveURL(/\/auth\/login$/);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByLabel('Username', { exact: true })).toBeVisible();
});

test('wrong credentials keep the typed values and show one banner', async ({ page }) => {
  await clearAuthState(page);
  await page.getByLabel('Username', { exact: true }).fill('mohamed');
  await page.getByLabel('Password', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText("Those details don't match an account.");
  await expect(page.getByLabel('Username', { exact: true })).toHaveValue('mohamed');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('wrong-password');
});

test('parent can sign in, top up, and send money', async ({ page }) => {
  await clearAuthState(page);
  await signIn(page, 'mohamed', 'Orbit@123');
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

test('sign-up, activate, and sign-in flow works end to end', async ({ page }) => {
  await clearAuthState(page);
  const stamp = Date.now().toString().slice(-6);
  const username = `user${stamp}`;
  const email = `user${stamp}@example.com`;

  await page.getByRole('link', { name: 'Create an account' }).click();
  await page.getByLabel('First name').fill('Omar');
  await page.getByLabel('Last name').fill('Hassan');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await expect(page.getByText('This username is available')).toBeVisible({ timeout: 5_000 });
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Mobile number').fill('01099887766');
  await page.getByLabel('Password', { exact: true }).fill('Passw0rd1');
  await page.getByLabel('Confirm password').fill('Passw0rd1');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  const token = await page.evaluate(() => {
    return (window as unknown as { __orbitLastVerifyToken?: string }).__orbitLastVerifyToken ?? '';
  });
  expect(token).toBeTruthy();

  await page.goto(`/activate?token=${token}&email=${encodeURIComponent(email)}`);
  await expect(page.getByRole('heading', { name: 'Your wallet is ready' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in to Orbit' }).click();

  await signIn(page, username, 'Passw0rd1');
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('unverified users cannot sign in', async ({ page }) => {
  await clearAuthState(page);
  const stamp = Date.now().toString().slice(-6);
  const username = `pend${stamp}`;
  const email = `pend${stamp}@example.com`;

  await page.goto('/auth/sign-up');
  await page.getByLabel('First name').fill('Pending');
  await page.getByLabel('Last name').fill('User');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Mobile number').fill('01122334455');
  await page.getByLabel('Password', { exact: true }).fill('Passw0rd1');
  await page.getByLabel('Confirm password').fill('Passw0rd1');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();

  await page.goto('/auth/login');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill('Passw0rd1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText('Confirm your email before signing in');
  await expect(page).toHaveURL(/\/auth\/login/);
});

test('parent can manage a child wallet', async ({ page }) => {
  await clearAuthState(page);
  await signIn(page, 'mohamed', 'Orbit@123');
  await page.goto('/family');
  await expect(page.getByRole('heading', { name: 'Family' })).toBeVisible();
  await expect(page.getByText('Youssef Mahmoud')).toBeVisible();
  await expect(page.getByText('Nour Mahmoud')).toBeVisible();

  await page.getByRole('link', { name: 'Add a child', exact: true }).first().click();
  await page.getByRole('button', { name: 'Create child wallet' }).click();
  await expect(page.getByRole('heading', { name: 'Child wallet created' })).toBeVisible();
});

test('child account sees the restricted wallet shell', async ({ page }) => {
  await clearAuthState(page);
  await signIn(page, 'youssef', 'Youssef@123');
  await expect(page.getByRole('heading', { name: 'Hi Youssef' })).toBeVisible();
  await expect(page.getByText(/Direct top-ups and transfers are not available/)).toBeVisible();
});

test('merchant payment requires an authenticated Orbit session', async ({ page }) => {
  await clearAuthState(page);
  await page.goto('/pay/nile-books');
  await expect(page.getByRole('heading', { name: 'The Yacoubian Building' })).toBeVisible();
  await page.getByRole('button', { name: 'Pay with Orbit' }).click();
  await expect(page.getByText('Sign in to Orbit before confirming this payment.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm payment' })).toBeDisabled();

  await page.getByRole('link', { name: 'Sign in' }).click();
  await signIn(page, 'mohamed', 'Orbit@123');
  await page.goto('/pay/nile-books');
  await page.getByRole('button', { name: 'Pay with Orbit' }).click();
  await page.getByRole('button', { name: 'Confirm payment' }).click();
  await expect(page.getByRole('heading', { name: 'Payment accepted' })).toBeVisible();
  await page.getByRole('button', { name: 'Settle demo payment' }).click();
  await expect(page.getByRole('heading', { name: 'Payment completed' })).toBeVisible();
});
