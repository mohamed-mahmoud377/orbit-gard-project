import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError, badRequest, conflict } from '../src/lib/errors.js';
import { buildProductWhere, orderByFor, toProductCard } from '../src/services/catalog.js';
import { formatOrderNumber, orderProductName } from '../src/services/orders.js';
import { buildCartResponse } from '../src/services/cart.js';
import { loadCatalog } from '../src/seed/seed-catalog.js';
import { maskUsername } from '../src/routes/payments.js';
import { logger } from '../src/lib/logger.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- errors ---

test('every error serialises into the contract envelope', () => {
  const err = badRequest('CARD_INVALID', 'Please check your card details.', {
    fieldErrors: { cardNumber: 'Card number is invalid' },
  });
  assert.deepEqual(err.toJSON(), {
    error: {
      code: 'CARD_INVALID',
      message: 'Please check your card details.',
      details: { fieldErrors: { cardNumber: 'Card number is invalid' } },
    },
  });

  // `details` is omitted entirely when there is nothing to say.
  assert.deepEqual(conflict('CART_EMPTY', 'Your cart is empty.').toJSON(), {
    error: { code: 'CART_EMPTY', message: 'Your cart is empty.' },
  });
  assert.ok(new AppError(402, 'X', 'y') instanceof Error);
});

// ------------------------------------------------------- order numbering ---

test('order numbers are zero-padded and year-scoped', () => {
  assert.equal(formatOrderNumber(123, 2026), 'JS-2026-000123');
  assert.equal(formatOrderNumber(1, 2026), 'JS-2026-000001');
  assert.equal(formatOrderNumber(1234567, 2026), 'JS-2026-1234567');
});

test('the Orbit productName describes the order and stays under 255', () => {
  assert.equal(orderProductName({ order_number: 'JS-2026-000123' }, 3), 'Order JS-2026-000123 (3 items)');
  assert.equal(orderProductName({ order_number: 'JS-2026-000123' }, 1), 'Order JS-2026-000123 (1 item)');
  assert.ok(orderProductName({ order_number: 'X'.repeat(400) }, 2).length <= 255);
});

// ------------------------------------------------------- username masking ---

test('the Orbit username is masked before it goes back to the browser', () => {
  assert.equal(maskUsername('omar123'), 'om•••23');
  assert.equal(maskUsername('mo'), 'm•');
  assert.equal(maskUsername('abcd'), 'a•••');
  const masked = maskUsername('averylongusername');
  assert.ok(masked.startsWith('av') && masked.endsWith('me'));
  assert.ok(!masked.includes('erylongusernam'));
});

// -------------------------------------------------------- search filters ---

test('the search WHERE clause parameterises every filter', () => {
  const { sql, params } = buildProductWhere({
    q: 'ultrabook',
    category: 'electronics',
    subcategory: 'laptops',
    brand: ['Aurora', 'Meridian'],
    minPrice: 100000,
    maxPrice: 900000,
    minRating: 4,
    badge: 'DEAL',
    inStock: true,
  });
  assert.match(sql, /^WHERE /);
  assert.match(sql, /websearch_to_tsquery/);
  assert.match(sql, /p\.brand = ANY\(\$\d+::text\[\]\)/);
  assert.match(sql, /p\.stock > 0/);
  // Nothing is interpolated: every value arrives as a bind parameter.
  assert.ok(!sql.includes('ultrabook'));
  assert.ok(!sql.includes('Aurora'));
  assert.deepEqual(params, [
    'ultrabook',
    '%ultrabook%',
    'electronics',
    'laptops',
    ['Aurora', 'Meridian'],
    100000,
    900000,
    4,
    'DEAL',
  ]);
});

test('facet counts drop their own dimension so the facet list does not collapse', () => {
  const filters = { category: 'electronics', brand: ['Aurora'], minPrice: 1000, maxPrice: 2000, minRating: 4 };

  const brandFacet = buildProductWhere(filters, 'brand');
  assert.ok(!brandFacet.sql.includes('p.brand'), 'the brand facet must ignore the brand filter');
  assert.ok(brandFacet.sql.includes('p.price_cents >='), 'but must keep every other filter');
  assert.ok(brandFacet.sql.includes('p.rating >='));

  const priceFacet = buildProductWhere(filters, 'price');
  assert.ok(!priceFacet.sql.includes('price_cents'), 'the price range must ignore the price filter');
  assert.ok(priceFacet.sql.includes('p.brand'));

  const ratingFacet = buildProductWhere(filters, 'rating');
  assert.ok(!ratingFacet.sql.includes('p.rating'), 'the rating facet must ignore the rating filter');
  assert.ok(ratingFacet.sql.includes('p.brand'));

  // The unfiltered form is still valid SQL to append.
  assert.equal(buildProductWhere({}).sql, '');
});

test('sorts map to deterministic ORDER BY clauses', () => {
  assert.match(orderByFor('price_asc', false), /^p\.price_cents ASC/);
  assert.match(orderByFor('price_desc', false), /^p\.price_cents DESC/);
  assert.match(orderByFor('newest', false), /^p\.created_at DESC/);
  assert.match(orderByFor('rating', false), /^p\.rating DESC/);
  assert.match(orderByFor('popular', false), /^p\.rating_count DESC/);
  assert.match(orderByFor('relevance', true), /^rank DESC/);
  // Relevance without a query has nothing to rank, so it degrades gracefully.
  assert.match(orderByFor('relevance', false), /^p\.rating DESC/);
  // Every clause ends in a unique tiebreaker so pagination cannot repeat rows.
  for (const sort of ['price_asc', 'price_desc', 'newest', 'rating', 'popular', 'relevance']) {
    assert.match(orderByFor(sort, true), /p\.id$/);
  }
});

// ------------------------------------------------------------------ cart ---

const productRow = (over = {}) => ({
  id: '11111111-1111-1111-1111-111111111111',
  slug: 'aurora-x14',
  name: 'Aurora X14',
  brand: 'Aurora',
  price_cents: 4599900,
  list_price_cents: 5299900,
  rating: 4.6,
  rating_count: 12,
  stock: 5,
  badges: [],
  short_description: '',
  description: '',
  features: [],
  specs: {},
  tags: [],
  images: ['https://example.test/a.jpg'],
  free_shipping: true,
  created_at: new Date('2026-03-11T00:00:00Z'),
  category_slug: 'electronics',
  category_name: 'Electronics',
  subcategory_slug: 'laptops',
  subcategory_name: 'Laptops',
  qty: 2,
  ...over,
});

test('the cart response matches the shape in the contract', () => {
  const cart = buildCartResponse([productRow()]);
  assert.equal(cart.items.length, 1);
  assert.equal(cart.items[0].qty, 2);
  assert.equal(cart.items[0].lineTotalCents, 9199800);
  assert.equal(cart.subtotalCents, 9199800);
  assert.equal(cart.taxCents, 1287972);
  assert.equal(cart.totalCents, 9199800 + 1287972);
  assert.equal(cart.itemCount, 2);
  assert.equal(typeof cart.items[0].product.priceCents, 'number');
});

test('a cart line flags when it now exceeds available stock', () => {
  const cart = buildCartResponse([productRow({ qty: 9, stock: 3 })]);
  assert.equal(cart.items[0].exceedsStock, true);
  assert.equal(buildCartResponse([productRow({ qty: 1, stock: 3 })]).items[0].exceedsStock, false);
});

test('the product card exposes a discount percentage and stock flag', () => {
  const card = toProductCard(productRow());
  assert.equal(card.discountPercent, 13); // 4599900 vs 5299900
  assert.equal(card.inStock, true);
  assert.equal(toProductCard(productRow({ stock: 0 })).inStock, false);
  assert.equal(toProductCard(productRow({ list_price_cents: null })).discountPercent, 0);
});

// --------------------------------------------------------------- catalog ---

test('a missing catalog.json fails with an actionable message', async () => {
  await assert.rejects(() => loadCatalog('/tmp/definitely-not-here/catalog.json'), (err) => {
    assert.match(err.message, /Catalog file not found/);
    assert.match(err.message, /generated at build time/);
    return true;
  });
});

test('the sample catalog parses and matches the documented shape', async () => {
  const catalog = await loadCatalog(path.join(here, '../src/catalog/catalog.sample.json'));
  assert.equal(catalog.currency, 'EGP');
  assert.ok(catalog.categories.length >= 2);
  assert.equal(catalog.products.length, 6);
  for (const p of catalog.products) {
    assert.ok(Number.isInteger(p.priceCents), `${p.slug} priceCents must be integer cents`);
    assert.ok(p.images.length >= 3, `${p.slug} needs at least 3 images`);
    assert.ok(catalog.categories.some((c) => c.slug === p.categorySlug));
  }
});

// --------------------------------------------------------------- logging ---

test('the logger redacts anything that looks like a credential', (t) => {
  const written = [];
  const original = process.stdout.write;
  process.stdout.write = (chunk) => (written.push(String(chunk)), true);
  t.after(() => {
    process.stdout.write = original;
  });

  logger.info('payment attempt', {
    password: 'MyPass123',
    cardNumber: '4242424242424242',
    token: 'jwt.secret.value',
    nested: { cvv: '123', orderId: 'ok-to-log' },
  });

  process.stdout.write = original;
  const line = written.join('');
  assert.ok(!line.includes('MyPass123'));
  assert.ok(!line.includes('4242424242424242'));
  assert.ok(!line.includes('jwt.secret.value'));
  assert.ok(!line.includes('"123"'));
  assert.ok(line.includes('ok-to-log'));
});
