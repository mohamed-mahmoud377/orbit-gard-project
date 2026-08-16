import { withTransaction, query } from '../db/pool.js';
import { conflict, notFound, AppError } from '../lib/errors.js';
import { computeTotals } from './pricing.js';

const iso = (v) => (v instanceof Date ? v.toISOString() : v);

/** `OB-2026-000123` */
export function formatOrderNumber(seq, year = new Date().getUTCFullYear()) {
  return `OB-${year}-${String(seq).padStart(6, '0')}`;
}

/**
 * Snapshot the cart into a PENDING order (CONTRACT §6).
 * The cart is deliberately left alone — it is only cleared once money moves.
 *
 * @param {string} userId
 * @param {{ addressId: string, shippingMethod: 'standard'|'express' }} input
 */
export async function createOrder(userId, input) {
  return withTransaction(async (client) => {
    const { rows: addressRows } = await client.query(
      'SELECT * FROM addresses WHERE id = $1 AND user_id = $2',
      [input.addressId, userId],
    );
    const address = addressRows[0];
    if (!address) throw notFound('ADDRESS_NOT_FOUND', 'That delivery address no longer exists.');

    // Lock the product rows we are about to reserve against, in a stable order,
    // so two checkouts of the last unit cannot both read stock as available.
    const { rows: items } = await client.query(
      `SELECT ci.qty, p.id, p.slug, p.name, p.price_cents, p.stock, p.free_shipping, p.images
       FROM cart_items ci
       JOIN carts ct ON ct.id = ci.cart_id
       JOIN products p ON p.id = ci.product_id
       WHERE ct.user_id = $1
       ORDER BY p.id
       FOR UPDATE OF p`,
      [userId],
    );

    if (items.length === 0) throw conflict('CART_EMPTY', 'Your cart is empty.');

    const short = items.filter((i) => i.qty > i.stock);
    if (short.length > 0) {
      throw conflict('OUT_OF_STOCK', 'Some items in your cart are no longer available in that quantity.', {
        items: short.map((i) => ({ productId: i.id, slug: i.slug, name: i.name, requested: i.qty, available: i.stock })),
      });
    }

    const totals = computeTotals(
      items.map((i) => ({ priceCents: Number(i.price_cents), qty: i.qty, freeShipping: i.free_shipping })),
      { shippingMethod: input.shippingMethod },
    );

    const { rows: seqRows } = await client.query("SELECT nextval('order_number_seq')::bigint AS seq");
    const orderNumber = formatOrderNumber(Number(seqRows[0].seq));

    const { rows: orderRows } = await client.query(
      `INSERT INTO orders (
         user_id, order_number, status, payment_status, shipping_method,
         subtotal_cents, shipping_cents, tax_cents, discount_cents, total_cents,
         shipping_full_name, shipping_phone, shipping_line1, shipping_line2,
         shipping_city, shipping_governorate, shipping_postal_code)
       VALUES ($1, $2, 'PENDING', 'UNPAID', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        userId,
        orderNumber,
        totals.shippingMethod,
        totals.subtotalCents,
        totals.shippingCents,
        totals.taxCents,
        totals.discountCents,
        totals.totalCents,
        address.full_name,
        address.phone,
        address.line1,
        address.line2,
        address.city,
        address.governorate,
        address.postal_code,
      ],
    );
    const order = orderRows[0];

    const snapshot = items.map((i) => ({
      product_id: i.id,
      name: i.name,
      slug: i.slug,
      image: i.images?.[0] ?? null,
      unit_price_cents: Number(i.price_cents),
      qty: i.qty,
      line_total_cents: Number(i.price_cents) * i.qty,
    }));

    const { rows: itemRows } = await client.query(
      `INSERT INTO order_items (order_id, product_id, name, slug, image, unit_price_cents, qty, line_total_cents)
       SELECT $1, x.product_id, x.name, x.slug, x.image, x.unit_price_cents, x.qty, x.line_total_cents
       FROM jsonb_to_recordset($2::jsonb) AS x(
         product_id uuid, name text, slug text, image text,
         unit_price_cents bigint, qty integer, line_total_cents bigint)
       RETURNING *`,
      [order.id, JSON.stringify(snapshot)],
    );

    return toOrder(order, itemRows, null);
  });
}

/**
 * Lock an order for payment and assert it is actually payable.
 * `FOR UPDATE` is what stops two concurrent pay calls from both succeeding:
 * the second blocks here until the first commits, then sees PAID and bails.
 *
 * @param {import('pg').PoolClient} client
 * @param {string} orderId
 * @param {string} userId
 */
export async function lockPayableOrder(client, orderId, userId) {
  const { rows } = await client.query(
    'SELECT * FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE',
    [orderId, userId],
  );
  const order = rows[0];
  if (!order) throw notFound('ORDER_NOT_FOUND', 'We could not find that order.');

  if (order.payment_status === 'PAID') {
    throw conflict('ORDER_ALREADY_PAID', 'This order has already been paid for.');
  }
  if (order.payment_status === 'UNCERTAIN' || order.status === 'NEEDS_REVIEW') {
    throw new AppError(
      409,
      'ORDER_UNDER_REVIEW',
      'This order is on hold while we confirm an earlier payment attempt. Check your Orbit transactions — ' +
        'we will not let you be charged twice.',
    );
  }
  if (order.status === 'CANCELLED') {
    throw conflict('ORDER_CANCELLED', 'This order was cancelled.');
  }
  return order;
}

/**
 * Everything that must happen atomically when money has actually moved:
 * flip the order to PAID, write the payment row, decrement stock, empty the
 * cart. One transaction, no partial success.
 *
 * @param {import('pg').PoolClient} client
 * @param {any} order the row returned by lockPayableOrder
 * @param {object} payment
 */
export async function settlePaidOrder(client, order, payment) {
  const { rows: paymentRows } = await client.query(
    `INSERT INTO payments (order_id, method, status, amount_cents, card_last4, card_brand,
                           auth_code, orbit_transaction_id, orbit_reference)
     VALUES ($1, $2, 'APPROVED', $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      order.id,
      payment.method,
      order.total_cents,
      payment.cardLast4 ?? null,
      payment.cardBrand ?? null,
      payment.authCode ?? null,
      payment.orbitTransactionId ?? null,
      payment.orbitReference ?? null,
    ],
  );

  await client.query(
    `UPDATE orders
     SET status = 'PAID', payment_status = 'PAID', payment_method = $2, paid_at = now()
     WHERE id = $1`,
    [order.id, payment.method],
  );

  // Decrement from the snapshot, not the live cart — the order is the contract.
  await client.query(
    `UPDATE products p
     SET stock = GREATEST(0, p.stock - oi.qty)
     FROM order_items oi
     WHERE oi.order_id = $1 AND oi.product_id = p.id`,
    [order.id],
  );

  await client.query(
    'DELETE FROM cart_items ci USING carts ct WHERE ci.cart_id = ct.id AND ct.user_id = $1',
    [order.user_id],
  );

  return paymentRows[0];
}

/**
 * Record a failed attempt without touching the order's payability.
 * @param {import('pg').PoolClient | {query: Function}} db
 */
export async function recordFailedPayment(db, order, { method, status, code, message }) {
  const { rows } = await db.query(
    `INSERT INTO payments (order_id, method, status, amount_cents, failure_code, failure_message)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [order.id, method, status, order.total_cents, code ?? null, message ?? null],
  );
  return rows[0];
}

export function toOrderItem(row) {
  return {
    id: row.id,
    productId: row.product_id,
    name: row.name,
    slug: row.slug,
    image: row.image,
    unitPriceCents: Number(row.unit_price_cents),
    qty: row.qty,
    lineTotalCents: Number(row.line_total_cents),
  };
}

export function toPayment(row) {
  if (!row) return null;
  return {
    id: row.id,
    method: row.method,
    status: row.status,
    amountCents: Number(row.amount_cents),
    cardLast4: row.card_last4,
    cardBrand: row.card_brand,
    authCode: row.auth_code,
    orbitTransactionId: row.orbit_transaction_id,
    orbitReference: row.orbit_reference,
    failureCode: row.failure_code,
    failureMessage: row.failure_message,
    createdAt: iso(row.created_at),
  };
}

/** Order DTO. Never carries an Orbit token — those live only in orbit_sessions. */
export function toOrder(row, items = null, payment = null) {
  const order = {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
    shippingMethod: row.shipping_method,
    subtotalCents: Number(row.subtotal_cents),
    shippingCents: Number(row.shipping_cents),
    taxCents: Number(row.tax_cents),
    discountCents: Number(row.discount_cents),
    totalCents: Number(row.total_cents),
    itemCount: row.item_count === undefined ? undefined : Number(row.item_count),
    shippingAddress: {
      fullName: row.shipping_full_name,
      phone: row.shipping_phone,
      line1: row.shipping_line1,
      line2: row.shipping_line2,
      city: row.shipping_city,
      governorate: row.shipping_governorate,
      postalCode: row.shipping_postal_code,
    },
    placedAt: iso(row.placed_at),
    paidAt: iso(row.paid_at),
  };
  if (items) order.items = items.map(toOrderItem);
  if (payment !== null) order.payment = toPayment(payment);
  return order;
}

/** @param {string} userId */
export async function listOrders(userId) {
  const { rows } = await query(
    `SELECT o.*, (SELECT coalesce(sum(qty), 0) FROM order_items WHERE order_id = o.id)::bigint AS item_count
     FROM orders o WHERE o.user_id = $1 ORDER BY o.placed_at DESC`,
    [userId],
  );
  return rows.map((r) => toOrder(r));
}

/**
 * @param {string} userId
 * @param {string} orderId
 */
export async function getOrder(userId, orderId) {
  const { rows } = await query('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [orderId, userId]);
  if (!rows[0]) throw notFound('ORDER_NOT_FOUND', 'We could not find that order.');

  const [items, payment] = await Promise.all([
    query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY name', [orderId]),
    query(
      `SELECT * FROM payments WHERE order_id = $1
       ORDER BY (status = 'APPROVED') DESC, created_at DESC LIMIT 1`,
      [orderId],
    ),
  ]);
  return toOrder(rows[0], items.rows, payment.rows[0] ?? null);
}

/** Summary line used in the Orbit `productName` field. */
export function orderProductName(order, itemCount) {
  return `Order ${order.order_number} (${itemCount} item${itemCount === 1 ? '' : 's'})`.slice(0, 255);
}
