import { Page, expect, test } from '@playwright/test';

/**
 * iPhone layout audit.
 *
 * Horizontal overflow is the mobile bug that matters: it is invisible on a
 * desktop viewport, it makes a page scroll sideways, and it pushes buttons
 * off the edge of the screen where they cannot be tapped. It is also
 * measurable, which beats squinting at screenshots — every route below is
 * loaded at iPhone width and asked whether anything sticks out past the
 * viewport.
 *
 * 375px is the tightest iPhone still in wide use (SE, and the 12/13 mini).
 * Anything that fits there fits every larger iPhone.
 */
test.use({
  viewport: { width: 375, height: 667 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});

const LONG_NAME = 'Mohamed Mahmoud Said Ibrahim';

function json(body: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify(body) };
}

const TRANSACTIONS = Array.from({ length: 8 }, (_, i) => ({
  id: `tx-${i}`,
  type: i % 3 === 0 ? 'TOPUP' : i % 3 === 1 ? 'TRANSFER_OUT' : 'EXTERNAL_PAYMENT',
  direction: i % 3 === 1 ? 'DEBIT' : 'CREDIT',
  status: ['COMPLETED', 'PENDING', 'REJECTED', 'FAILED'][i % 4],
  amount: i % 2 === 0 ? '12500.75' : '85.00',
  reference: `REF-${1000 + i}`,
  transactionPublicId: `4a77d0c1b9${i}`,
  description: 'External payment: Bought Wireless Over-Ear Headphones From: Jerry’s Electronics Shop',
  counterparty: LONG_NAME,
  createdAt: new Date(Date.now() - i * 86_400_000).toISOString(),
  resolvedAt: new Date(Date.now() - i * 86_400_000).toISOString(),
}));

/**
 * Deliberately unflattering data: the longest realistic account name, a
 * five-figure amount, a wrapping merchant description. Mobile layouts break
 * on the long values, not the short ones in the design mock.
 */
async function mockApi(page: Page): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api\/v1/, '').replace(/\/$/, '');

    if (path === '/users/me') {
      return route.fulfill(
        json({
          firstname: 'Mohamed',
          lastname: 'Mahmoud Said Ibrahim',
          username: 'mohamed.mahmoud.said',
          role: 'USER',
          childrenCount: 2,
        }),
      );
    }

    if (path === '/wallet') {
      return route.fulfill(json({ balance: '128450.75', held: '2500.00', available: '125950.75' }));
    }

    if (path === '/wallet/transactions/summary') {
      return route.fulfill(
        json({
          moneyInThisMonth: '45000.00',
          moneyOutThisMonth: '18250.50',
          currentlyHeld: '2500.00',
          rejectedCount: 3,
        }),
      );
    }

    if (path === '/wallet/transactions') {
      return route.fulfill(
        json({
          content: TRANSACTIONS,
          page: 0,
          size: 20,
          totalElements: TRANSACTIONS.length,
          totalPages: 1,
          first: true,
          last: true,
        }),
      );
    }

    if (path === '/wallet/topup/instapay/account') {
      return route.fulfill(
        json({
          accountName: LONG_NAME,
          accountNumber: '01111545710',
          minAmount: 0.01,
          maxAmount: 70000.0,
          maxImageBytes: 1048576,
        }),
      );
    }

    if (path === '/wallet/topup/instapay') {
      return route.fulfill(
        json({
          anyUnresolved: true,
          content: [
            { id: 'r1', status: 'PENDING', submittedAt: new Date().toISOString() },
            { id: 'r2', status: 'PROCESSING', submittedAt: new Date().toISOString() },
            {
              id: 'r3',
              status: 'COMPLETED',
              amount: 12500.75,
              referenceNumber: '461669173693',
              submittedAt: new Date(Date.now() - 86_400_000).toISOString(),
              resolvedAt: new Date(Date.now() - 86_400_000).toISOString(),
            },
            {
              id: 'r4',
              status: 'REJECTED',
              amount: 2000.0,
              referenceNumber: '91cc3d0a4f',
              rejectionReason: 'WRONG_RECIPIENT',
              submittedAt: new Date(Date.now() - 6 * 86_400_000).toISOString(),
            },
            {
              id: 'r5',
              status: 'REJECTED',
              rejectionReason: 'REFERENCE_NOT_VISIBLE',
              submittedAt: new Date(Date.now() - 8 * 86_400_000).toISOString(),
            },
            { id: 'r6', status: 'FAILED', submittedAt: new Date(Date.now() - 9 * 86_400_000).toISOString() },
          ],
        }),
      );
    }

    if (path === '/family/overview') {
      return route.fulfill(
        json({ childrenCount: 2, allocatedThisMonth: '800.00', spentThisMonth: '415.00', blockedAttempts: 3 }),
      );
    }

    if (path === '/family/children') {
      return route.fulfill(
        json([
          {
            id: 'child-youssef',
            name: 'Youssef Mahmoud Said Ibrahim',
            handle: '@youssef.mahmoud.said',
            status: 'ACTIVE',
            available: '2450.00',
            balance: '2950.00',
            held: '500.00',
            limits: {
              today: { spent: '60.00', max: '150.00' },
              month: { spent: '255.00', max: '1000.00' },
              perTransaction: '100.00',
            },
          },
        ]),
      );
    }

    // NOTE the casing: /users/me is lowercase (firstname/lastname) but
    // /profile is camelCase with phoneNumber. They are different contracts
    // with different adapters, and getting this wrong does not fail loudly —
    // SettingsPage.applyProfile() throws on the undefined phone before
    // loading.set(false) runs, leaving the page on its spinner forever.
    if (path === '/profile') {
      return route.fulfill(
        json({
          firstName: 'Mohamed',
          lastName: 'Mahmoud Said Ibrahim',
          username: 'mohamed.mahmoud.said',
          email: 'mohamed.mahmoud.said@example.com',
          phoneNumber: '01111545710',
          nonRevokedSessionCount: 2,
        }),
      );
    }

    if (path.startsWith('/sessions')) {
      return route.fulfill(
        json([
          {
            id: 's1',
            device: 'Chrome on macOS Sonoma (this device)',
            lastActiveAt: new Date().toISOString(),
            current: true,
          },
        ]),
      );
    }

    return route.fulfill(json({}));
  });
}

async function seedChild(page: Page): Promise<void> {
  await page.goto('/auth/login');
  await page.evaluate(() => {
    window.localStorage.setItem(
      'orbit.auth-session.v1',
      JSON.stringify({
        accessToken: 'audit-access-token',
        refreshToken: 'audit-refresh-token',
        tokenType: 'Bearer',
        expiresAt: Date.now() + 3_600_000,
        rememberMe: false,
        user: { id: '2', username: 'omar', firstName: 'Omar', lastName: 'Mahmoud', accountType: 'CHILD' },
      }),
    );
  });
}

async function seedParent(page: Page): Promise<void> {
  await page.goto('/auth/login');
  await page.evaluate(() => {
    window.localStorage.setItem(
      'orbit.auth-session.v1',
      JSON.stringify({
        accessToken: 'audit-access-token',
        refreshToken: 'audit-refresh-token',
        tokenType: 'Bearer',
        expiresAt: Date.now() + 3_600_000,
        rememberMe: false,
        user: {
          id: '1',
          username: 'mohamed.mahmoud.said',
          firstName: 'Mohamed',
          lastName: 'Mahmoud Said Ibrahim',
          accountType: 'USER',
        },
      }),
    );
  });
}

interface OverflowReport {
  readonly viewportWidth: number;
  readonly documentScrollWidth: number;
  readonly offenders: readonly { tag: string; cls: string; left: number; right: number; width: number }[];
}

/**
 * Reports only the OUTERMOST overflowing elements.
 *
 * When a container is too wide every descendant reports as overflowing too,
 * which buries the one element actually responsible under fifty of its
 * children. An element whose parent already overflows is a symptom, not the
 * cause, so it is skipped.
 */
async function overflowReport(page: Page): Promise<OverflowReport> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const overflows = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (r.right > vw + 1 || r.left < -1);
    };

    const offenders: { tag: string; cls: string; left: number; right: number; width: number }[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      if (!overflows(el)) continue;
      const parent = el.parentElement;
      if (parent && parent !== document.body && overflows(parent)) continue;
      const r = el.getBoundingClientRect();
      offenders.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.getAttribute('class') ?? '').slice(0, 70),
        left: Math.round(r.left),
        right: Math.round(r.right),
        width: Math.round(r.width),
      });
    }

    return {
      viewportWidth: vw,
      documentScrollWidth: document.documentElement.scrollWidth,
      offenders: offenders.slice(0, 10),
    };
  });
}

function describeOverflow(name: string, report: OverflowReport): string {
  const lines = report.offenders.map(
    (o) => `    <${o.tag} class="${o.cls}">  left=${o.left} right=${o.right} width=${o.width}`,
  );
  return [
    `${name}: page scrolls sideways at ${report.viewportWidth}px`,
    `  document.scrollWidth = ${report.documentScrollWidth} (viewport ${report.viewportWidth})`,
    `  widest offenders:`,
    ...(lines.length ? lines : ['    (none isolated — check a fixed width on a top-level element)']),
  ].join('\n');
}

/**
 * iOS Safari zooms the whole page in when a focused form control has a font
 * smaller than 16px, and never zooms back out. The app sets `font: inherit`
 * on inputs against a 14px body, so every field on every form triggers it.
 */
async function smallFontControls(page: Page) {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll(
        // Text entry only. A checkbox or radio cannot be typed into, so it
        // never triggers the zoom regardless of its font size.
        "input:not([type='checkbox']):not([type='radio']):not([type='button']):not([type='submit']), select, textarea",
      ),
    )
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .map((el) => ({
        id: el.getAttribute('id') ?? el.getAttribute('name') ?? el.tagName.toLowerCase(),
        fontSize: parseFloat(getComputedStyle(el).fontSize),
      }))
      .filter((f) => f.fontSize < 16),
  );
}

/**
 * Content cut off by an `overflow: hidden` ancestor.
 *
 * This is the failure the scrollWidth check cannot see, and it is the more
 * dangerous of the two. An overflowing page at least scrolls sideways, which
 * is ugly but survivable; an overflowing element inside a clipping ancestor
 * is simply sliced off, with no scrollbar and nothing to drag. The login
 * form shipped this way — a 500px form in a 327px column under two
 * overflow:hidden parents rendered "Welcome back" as "ome back".
 *
 * Text nodes only. A decorative graphic hanging off the edge of a panel is
 * usually deliberate; a clipped sentence never is.
 */
async function clippedText(page: Page) {
  return page.evaluate(() => {
    const clipper = (el: Element): Element | null => {
      let node = el.parentElement;
      while (node && node !== document.documentElement) {
        const o = getComputedStyle(node);
        if (/hidden|clip/.test(o.overflowX)) return node;
        node = node.parentElement;
      }
      return null;
    };

    const out: { text: string; by: string; overhang: number }[] = [];
    for (const el of Array.from(document.querySelectorAll('h1, h2, h3, p, label, span, a, button'))) {
      const text = (el.textContent ?? '').trim();
      if (!text || el.children.length > 0) continue;

      const host = clipper(el);
      if (!host) continue;

      const r = el.getBoundingClientRect();
      const c = host.getBoundingClientRect();
      if (r.width === 0) continue;

      const overhang = Math.round(Math.max(c.left - r.left, r.right - c.right));
      if (overhang > 1) {
        out.push({
          text: text.slice(0, 40),
          by: `${host.tagName.toLowerCase()}.${(host.getAttribute('class') ?? '').slice(0, 30)}`,
          overhang,
        });
      }
    }
    return out.slice(0, 10);
  });
}

/**
 * Is anything actually un-tappable?
 *
 * The mobile layouts put the nav in a `position: fixed` bar pinned to the
 * bottom of the screen, which floats above the page and is invisible to an
 * overflow check. If the scroll container's bottom padding is ever too small
 * for it, the last control on the page — usually the submit button — sits
 * underneath it and simply cannot be pressed, while looking completely fine
 * in a screenshot.
 *
 * elementFromPoint answers it directly: aim at the middle of each visible
 * control and see what the browser says would receive the tap.
 */
async function blockedControls(page: Page) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(400);
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('a, button'))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight
        );
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { el, hit, label: (el.textContent ?? '').trim().slice(0, 30) };
      })
      .filter(({ el, hit }) => hit !== null && !el.contains(hit) && !hit!.contains(el))
      .map(({ label, hit }) => ({
        label,
        blockedBy: `${hit!.tagName.toLowerCase()}.${(hit!.getAttribute('class') ?? '').slice(0, 40)}`,
      })),
  );
}

/** Apple's HIG minimum is 44x44pt. Reported, not enforced — the design uses 38px in places. */
async function smallTapTargets(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('a, button, [role="tab"], input[type="checkbox"]'))
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          label: (el.textContent ?? '').trim().slice(0, 30) || el.tagName.toLowerCase(),
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      })
      .filter((t) => t.w > 0 && t.h > 0 && (t.w < 44 || t.h < 44)),
  );
}

const ROUTES: readonly { name: string; path: string; ready: string; guest?: boolean }[] = [
  { name: 'landing', path: '/', ready: 'nothing but a username', guest: true },
  { name: 'login', path: '/auth/login', ready: 'Welcome back', guest: true },
  { name: 'sign-up', path: '/auth/sign-up', ready: 'Orbit', guest: true },
  { name: 'forgot-password', path: '/auth/forgot-password', ready: 'Orbit', guest: true },
  { name: 'dashboard', path: '/dashboard', ready: 'Orbit' },
  { name: 'top-up-paymob', path: '/top-up', ready: 'Top up your wallet' },
  { name: 'instapay-requests', path: '/top-up/instapay/requests', ready: 'InstaPay requests' },
  { name: 'send', path: '/send', ready: 'Orbit' },
  { name: 'transactions', path: '/transactions', ready: 'Orbit' },
  { name: 'family', path: '/family', ready: 'Orbit' },
  { name: 'settings', path: '/settings', ready: 'Orbit' },
];

test.describe('iPhone layout audit @ 375px', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
  });

  for (const route of ROUTES) {
    test(`${route.name} fits the viewport`, async ({ page }) => {
      // Auth screens must be visited signed out — guestGuard now redirects a
      // signed-in visitor to their dashboard, which is the whole point of it.
      if (route.guest) {
        await page.goto('/auth/login');
        await page.evaluate(() => window.localStorage.clear());
      } else {
        await seedParent(page);
      }

      await page.goto(route.path);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('body')).toContainText(route.ready, { timeout: 10_000 });

      const report = await overflowReport(page);
      await page.screenshot({
        path: `test-results/mobile-audit/${route.name}.png`,
        fullPage: true,
      });

      const zoomers = await smallFontControls(page);
      const taps = await smallTapTargets(page);
      if (zoomers.length) {
        console.log(`\n[${route.name}] iOS will zoom on focus — controls under 16px:`);
        zoomers.forEach((z) => console.log(`    ${z.id}: ${z.fontSize}px`));
      }
      if (taps.length) {
        console.log(`\n[${route.name}] tap targets under 44x44:`);
        taps.slice(0, 8).forEach((t) => console.log(`    "${t.label}" ${t.w}x${t.h}`));
      }

      expect(
        report.documentScrollWidth,
        describeOverflow(route.name, report),
      ).toBeLessThanOrEqual(report.viewportWidth + 1);

      expect(
        zoomers,
        `${route.name}: iOS Safari zooms the page when these focus (need >=16px)`,
      ).toEqual([]);

      const clipped = await clippedText(page);
      if (clipped.length) {
        console.log(`\n[${route.name}] clipped text:`);
        clipped.forEach((c) => console.log(`    "${c.text}" cut by ${c.overhang}px, inside ${c.by}`));
      }
      expect(
        clipped,
        `${route.name}: text is being cut off by an overflow:hidden ancestor`,
      ).toEqual([]);

      const blocked = await blockedControls(page);
      expect(
        blocked,
        `${route.name}: these controls cannot be tapped — something is on top of them`,
      ).toEqual([]);
    });
  }

  /**
   * There has to be a way out on a phone.
   *
   * Sign out lived only in the desktop sidebar, which both layouts set to
   * display:none on mobile — so a signed-in phone had no control anywhere on
   * screen to leave, and "Manage devices" cannot substitute because the
   * backend refuses to revoke the session making the request
   * (CANNOT_SIGN_OUT_CURRENT_DEVICE).
   */
  test('a parent can sign out from a phone', async ({ page }) => {
    await seedParent(page);
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    const signOut = page.getByRole('button', { name: 'Sign out', exact: true });
    await expect(signOut, 'no sign-out control on the settings page').toBeVisible();

    await signOut.click();
    await expect(page).toHaveURL(/\/auth\/login/);
    expect(
      await page.evaluate(() => window.localStorage.getItem('orbit.auth-session.v1')),
      'the stored session should be gone after signing out',
    ).toBeNull();
  });

  test('a child can sign out from a phone', async ({ page }) => {
    await seedChild(page);
    await page.goto('/my-wallet');
    await page.waitForLoadState('networkidle');

    const signOut = page.getByRole('button', { name: 'Sign out', exact: true });
    await expect(signOut, 'no sign-out control in the child top bar').toBeVisible();

    await signOut.click();
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('top-up InstaPay tab fits the viewport', async ({ page }) => {
    await seedParent(page);
    await page.goto('/top-up');
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: 'InstaPay transfer' }).click();
    await expect(page.locator('body')).toContainText('Send the money to this InstaPay number');

    const report = await overflowReport(page);
    await page.screenshot({ path: 'test-results/mobile-audit/top-up-instapay.png', fullPage: true });

    expect(
      report.documentScrollWidth,
      describeOverflow('top-up-instapay', report),
    ).toBeLessThanOrEqual(report.viewportWidth + 1);
  });
});
