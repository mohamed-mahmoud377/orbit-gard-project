import { expect, test } from '@playwright/test';

async function clearAuthState(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/auth/login');
  await page.evaluate(() => {
    window.localStorage.clear();
  });
  await page.reload();
}

async function seedAuthenticatedParent(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/auth/login');
  await page.evaluate(() => {
    const session = {
      accessToken: 'e2e-access-token',
      refreshToken: 'e2e-refresh-token',
      tokenType: 'Bearer',
      expiresAt: Date.now() + 3_600_000,
      rememberMe: false,
      user: {
        id: '1',
        username: 'mohamed',
        firstName: 'Mohamed',
        lastName: 'Mahmoud',
        accountType: 'USER',
      },
    };
    window.localStorage.setItem('orbit.auth-session.v1', JSON.stringify(session));
  });
}

async function mockFamilyApis(page: import('@playwright/test').Page): Promise<void> {
  const children = [
    {
      id: 'child-youssef',
      name: 'Youssef Mahmoud',
      handle: '@youssef',
      status: 'ACTIVE',
      available: '245.00',
      balance: '295.00',
      held: '50.00',
      limits: {
        today: { spent: '60.00', max: '150.00' },
        month: { spent: '255.00', max: '1000.00' },
        perTransaction: '100.00',
      },
    },
    {
      id: 'child-nour',
      name: 'Nour Mahmoud',
      handle: '@nour',
      status: 'ACTIVE',
      available: '110.00',
      balance: '160.00',
      held: '50.00',
      limits: {
        today: { spent: '90.00', max: '100.00' },
        month: { spent: '160.00', max: '600.00' },
        perTransaction: '100.00',
      },
    },
  ];

  await page.route('**/api/v1/family/overview', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          childrenCount: 2,
          allocatedThisMonth: '800.00',
          spentThisMonth: '415.00',
          blockedAttempts: 3,
        }),
      });
      return;
    }
    await route.continue();
  });

  await page.route(/\/api\/v1\/family\/children(\/.*)?$/, async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') {
      await route.continue();
      return;
    }

    const url = new URL(request.url());
    const pathname = url.pathname.replace(/\/$/, '');
    const listPath = '/api/v1/family/children';

    if (pathname === listPath) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(children),
      });
      return;
    }

    const transactionsSuffix = '/transactions';
    if (pathname.endsWith(transactionsSuffix)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          content: [],
          page: 0,
          size: 20,
          totalElements: 0,
          totalPages: 0,
          first: true,
          last: true,
        }),
      });
      return;
    }

    const childId = pathname.slice(`${listPath}/`.length);
    const child = children.find((item) => item.id === childId);
    if (!child) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: child.id,
        name: child.name,
        handle: child.handle,
        status: child.status,
        walletOpenedAt: '2026-06-12',
        available: child.available,
        balance: child.balance,
        held: child.held,
        allocatedThisMonth: '500.00',
        limits: {
          today: {
            spent: child.limits.today.spent,
            max: child.limits.today.max,
            remaining: '90.00',
          },
          month: {
            spent: child.limits.month.spent,
            max: child.limits.month.max,
            remaining: '745.00',
          },
          perTransaction: child.limits.perTransaction,
        },
      }),
    });
  });

  await page.route('**/api/v1/auth/add-child', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'child-mariam',
          username: 'mariam',
          firstName: 'Mariam',
          lastName: 'Mahmoud',
          status: 'ACTIVE',
        }),
      });
      return;
    }
    await route.continue();
  });
}

async function mockAccountApis(page: import('@playwright/test').Page): Promise<void> {
  await page.route('**/api/v1/profile', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          firstName: 'Mohamed',
          lastName: 'Mahmoud',
          username: 'mohamed',
          email: 'mohamed@example.com',
          phoneNumber: '01012345678',
          nonRevokedSessionCount: 2,
        }),
      });
      return;
    }
    await route.continue();
  });

  await page.route('**/api/v1/sessions**', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'session-current',
            deviceLabel: 'Chrome · MacBook Pro',
            location: 'Cairo, Egypt · 41.35.28.114',
            lastUsedAt: '2026-07-25T10:00:00Z',
            currentDevice: true,
          },
          {
            id: 'session-other',
            deviceLabel: 'Safari · iPhone',
            location: 'Alexandria, Egypt',
            lastUsedAt: '2026-07-24T08:00:00Z',
            currentDevice: false,
          },
        ]),
      });
      return;
    }
    await route.continue();
  });
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
  const recipient = page.locator('#recipient');
  await recipient.fill('sara');
  await recipient.blur();
  await expect(page.getByText('@sara')).toBeVisible();
  await page.locator('#send-amount').fill('200');
  await page.getByRole('button', { name: /Send EGP 200.00 to @sara/ }).click();
  await expect(page.getByRole('heading', { name: 'Money sent' })).toBeVisible();
});

test('send money blocks stale recipient after username edit', async ({ page }) => {
  await clearAuthState(page);
  await signIn(page, 'mohamed', 'Orbit@123');

  await page.getByRole('link', { name: 'Send money' }).first().click();
  const recipient = page.locator('#recipient');
  await recipient.fill('sara');
  await recipient.blur();
  await expect(page.getByText('@sara')).toBeVisible();

  const sendButton = page.getByRole('button', { name: /Send EGP/ });
  await expect(sendButton).toBeEnabled();

  await recipient.fill('omar');
  await expect(page.getByText('@sara')).not.toBeVisible();
  await expect(sendButton).toBeDisabled();

  await recipient.fill('sara');
  await recipient.blur();
  await expect(page.getByText('@sara')).toBeVisible();
  await page.locator('#send-amount').fill('200');
  await expect(sendButton).toBeEnabled();
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
  await mockFamilyApis(page);
  await seedAuthenticatedParent(page);

  await page.goto('/family');
  await expect(page.getByRole('heading', { name: 'Family' })).toBeVisible();
  await expect(page.getByText('Youssef Mahmoud')).toBeVisible();
  await expect(page.getByText('Nour Mahmoud')).toBeVisible();
  await expect(page.getByText('EGP 800.00')).toBeVisible();

  await page.getByRole('link', { name: 'Add a child', exact: true }).first().click();
  await page.getByLabel('First name').fill('Mariam');
  await page.getByLabel('Last name').fill('Mahmoud');
  await page.getByLabel('Username', { exact: true }).fill('mariam');
  await page.getByLabel('Temporary password').fill('Mariam@123');
  await page.getByLabel('Confirm password').fill('Mariam@123');
  await page.getByRole('button', { name: 'Create child wallet' }).click();
  await expect(page.getByRole('heading', { name: 'Child wallet created' })).toBeVisible();
});

test('parent can view child wallet detail with limits progress', async ({ page }) => {
  await clearAuthState(page);
  await mockFamilyApis(page);
  await seedAuthenticatedParent(page);

  await page.goto('/family');
  await page.getByRole('link', { name: 'View activity' }).first().click();
  await expect(page).toHaveURL(/\/family\/child-youssef$/);
  await expect(page.getByText('Youssef Mahmoud').first()).toBeVisible();
  await expect(page.getByText('@youssef')).toBeVisible();
  await expect(page.getByText('ACTIVE')).toBeVisible();
  await expect(page.getByText('EGP 60.00 of EGP 150.00')).toBeVisible();
  await expect(page.getByText('EGP 90.00 remaining today')).toBeVisible();
  await expect(page.getByText('Per transaction').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Edit spending limits' })).toBeVisible();
});

test('child account sees the restricted wallet shell', async ({ page }) => {
  await clearAuthState(page);
  await signIn(page, 'youssef', 'Youssef@123');
  await expect(page.getByRole('heading', { name: 'Hi Youssef' })).toBeVisible();
  await expect(page.getByText(/Direct top-ups and transfers are not available/)).toBeVisible();
});

test('parent can view devices and sessions', async ({ page }) => {
  await clearAuthState(page);
  await mockAccountApis(page);
  await seedAuthenticatedParent(page);

  await page.goto('/settings');
  await expect(page.getByText('2 active sessions.')).toBeVisible();
  await page.getByRole('link', { name: 'Manage devices' }).click();
  await expect(page.getByRole('heading', { name: 'Devices and sessions' })).toBeVisible();
  await expect(page.getByText('THIS DEVICE')).toBeVisible();
  await expect(page.getByText('Safari · iPhone')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out all others' })).toBeVisible();
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
