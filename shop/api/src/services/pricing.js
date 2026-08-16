import { SHIPPING, TAX_BASIS_POINTS } from '../config.js';
import { assertCents, percentOfCents } from '../lib/money.js';

/** @typedef {{ priceCents: number, qty: number, freeShipping?: boolean }} PriceableItem */

export const SHIPPING_METHODS = /** @type {const} */ (['standard', 'express']);

/**
 * @param {PriceableItem[]} items
 * @returns {number}
 */
export function subtotalCents(items) {
  return items.reduce((sum, item) => {
    assertCents(item.priceCents, 'priceCents');
    if (!Number.isInteger(item.qty) || item.qty < 0) {
      throw new TypeError(`qty must be a non-negative integer, got ${String(item.qty)}`);
    }
    return sum + item.priceCents * item.qty;
  }, 0);
}

/**
 * CONTRACT §6: free when subtotal >= 100000 cents (1000 EGP) **or** every item
 * is flagged freeShipping; otherwise 5000 standard / 15000 express.
 * An empty cart ships for nothing.
 *
 * @param {PriceableItem[]} items
 * @param {number} subtotal
 * @param {'standard'|'express'} [method]
 * @returns {number}
 */
export function shippingCents(items, subtotal, method = 'standard') {
  if (items.length === 0) return 0;
  if (subtotal >= SHIPPING.FREE_THRESHOLD_CENTS) return 0;
  if (items.every((i) => i.freeShipping === true)) return 0;
  return method === 'express' ? SHIPPING.EXPRESS_CENTS : SHIPPING.STANDARD_CENTS;
}

/**
 * 14% VAT on the subtotal (shipping is not taxed), rounded half-up.
 * @param {number} subtotal
 */
export function taxCents(subtotal) {
  return percentOfCents(subtotal, TAX_BASIS_POINTS);
}

/**
 * The one place order/cart money is computed. Everything downstream — the cart
 * response, the order snapshot and the Orbit `cashAmount` — reads these numbers.
 *
 * @param {PriceableItem[]} items
 * @param {{ shippingMethod?: 'standard'|'express', discountCents?: number }} [opts]
 */
export function computeTotals(items, opts = {}) {
  const method = SHIPPING_METHODS.includes(opts.shippingMethod) ? opts.shippingMethod : 'standard';
  const discount = assertCents(opts.discountCents ?? 0, 'discountCents');

  const subtotal = subtotalCents(items);
  const shipping = shippingCents(items, subtotal, method);
  const tax = taxCents(subtotal);
  const total = subtotal + shipping + tax - discount;

  return {
    subtotalCents: subtotal,
    shippingCents: shipping,
    taxCents: tax,
    discountCents: discount,
    totalCents: total,
    shippingMethod: method,
    itemCount: items.reduce((n, i) => n + i.qty, 0),
  };
}
