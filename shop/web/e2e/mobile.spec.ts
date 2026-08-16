import { devices, expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SHOTS = '.screenshots';
mkdirSync(SHOTS, { recursive: true });

// Pixel 5 is Chromium-based, so the suite needs only the one browser download.
test.use({ ...devices['Pixel 5'] });

test('mobile: drawer nav, bottom filter sheet and responsive layout', async ({ page }) => {
  /* ---------------------------------------------------------- home --- */
  await page.goto('/shop/');
  await expect(page.getByRole('heading', { name: 'Shop by department' })).toBeVisible();
  // Search moves to its own row below the logo; the desktop one is display:none,
  // so exactly one search box should be on screen.
  await expect(page.locator('ob-search-bar input[type="search"]:visible')).toHaveCount(1);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/20-mobile-home.png` });

  /* -------------------------------------------------------- drawer --- */
  await page.getByRole('button', { name: 'Open menu' }).click();
  const drawer = page.getByRole('dialog', { name: 'Departments' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('link', { name: /Electronics/ })).toBeVisible();

  // Subcategories expand in place.
  await drawer.getByRole('button', { name: /Show Electronics subcategories/ }).click();
  await expect(drawer.getByRole('link', { name: 'Smart Home & Hubs' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/21-mobile-drawer.png` });

  await drawer.getByRole('link', { name: 'Smart Home & Hubs' }).click();
  await expect(drawer).toBeHidden();
  await page.waitForURL(/\/shop\/c\/electronics\/smart-home/);

  /* -------------------------------------------------- filter sheet --- */
  await page.getByRole('button', { name: /Filters/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Filters' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('Price')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/22-mobile-filter-sheet.png` });

  // The sheet body is its own scroll container; drive it explicitly rather
  // than relying on the page-level scroll.
  const body = sheet.locator('div.ob-scroll-y');
  await expect(body).toBeVisible();
  const scrollable = await body.evaluate((el) => el.scrollHeight > el.clientHeight);
  expect(scrollable, 'the filter sheet body scrolls rather than overflowing').toBe(true);

  const ratingFilter = sheet.getByRole('button', { name: /& up/ }).first();
  await ratingFilter.scrollIntoViewIfNeeded();
  await ratingFilter.click();
  await page.waitForURL(/minRating=/);
  await expect(sheet).toBeHidden();

  /* ------------------------------------------------------- product --- */
  await page.locator('ob-product-card h3 a').first().click();
  await page.waitForURL(/\/shop\/p\//);
  await expect(page.locator('ob-gallery')).toBeVisible();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/23-mobile-product.png` });

  // Nothing should overflow the viewport horizontally.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'no horizontal overflow on mobile').toBeLessThanOrEqual(1);
});
