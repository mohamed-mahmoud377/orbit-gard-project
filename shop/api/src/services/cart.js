import { query } from '../db/pool.js';
import { PRODUCT_COLUMNS, toProductCard } from './catalog.js';
import { computeTotals } from './pricing.js';

/**
 * Fetch (or lazily create) the user's cart id.
 * @param {import('pg').PoolClient | {query: Function}} db
 * @param {string} userId
 */
export async function ensureCart(db, userId) {
  const { rows } = await db.query(
    `INSERT INTO carts (user_id) VALUES ($1)
     ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
     RETURNING id`,
    [userId],
  );
  return rows[0].id;
}

/**
 * @param {import('pg').PoolClient | {query: Function}} db
 * @param {string} userId
 * @param {{ forUpdate?: boolean }} [opts]
 */
export async function cartRows(db, userId, opts = {}) {
  const { rows } = await db.query(
    `SELECT ci.qty, ci.added_at, ${PRODUCT_COLUMNS}
     FROM cart_items ci
     JOIN carts ct ON ct.id = ci.cart_id
     JOIN products p ON p.id = ci.product_id
     JOIN categories c ON c.id = p.category_id
     LEFT JOIN subcategories s ON s.id = p.subcategory_id
     WHERE ct.user_id = $1
     ORDER BY ci.added_at ASC`,
    [userId],
  );
  return rows;
}

/**
 * Assemble the CONTRACT §6 cart payload from raw rows.
 * @param {any[]} rows
 * @param {'standard'|'express'} [shippingMethod]
 */
export function buildCartResponse(rows, shippingMethod = 'standard') {
  const items = rows.map((row) => {
    const product = toProductCard(row);
    return {
      product,
      qty: row.qty,
      lineTotalCents: product.priceCents * row.qty,
      // Surfaced so the checkout can explain a rejected quantity before the
      // order call fails with OUT_OF_STOCK.
      exceedsStock: row.qty > product.stock,
    };
  });

  const totals = computeTotals(
    rows.map((r) => ({ priceCents: Number(r.price_cents), qty: r.qty, freeShipping: r.free_shipping })),
    { shippingMethod },
  );

  return {
    items,
    subtotalCents: totals.subtotalCents,
    shippingCents: totals.shippingCents,
    taxCents: totals.taxCents,
    totalCents: totals.totalCents,
    itemCount: totals.itemCount,
    shippingMethod: totals.shippingMethod,
  };
}

/**
 * @param {string} userId
 * @param {'standard'|'express'} [shippingMethod]
 */
export async function getCart(userId, shippingMethod = 'standard') {
  const rows = await cartRows({ query }, userId);
  return buildCartResponse(rows, shippingMethod);
}
