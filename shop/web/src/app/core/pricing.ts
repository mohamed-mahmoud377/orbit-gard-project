import { CartLine, ProductCard, ShippingMethod } from './models';

/** Mirrors `shop/api/src/config.js`. */
export const FREE_SHIPPING_THRESHOLD_CENTS = 100_000;
export const STANDARD_SHIPPING_CENTS = 5_000;
export const EXPRESS_SHIPPING_CENTS = 15_000;
export const TAX_BASIS_POINTS = 1_400; // 14% VAT

/**
 * Round-half-up percentage in integer space — the exact algorithm from
 * `shop/api/src/lib/money.js#percentOfCents`, so a guest cart total and the
 * server's total for the same basket never disagree by a piastre.
 */
export function percentOfCents(cents: number, rateBasisPoints: number): number {
  const numerator = cents * rateBasisPoints;
  if (numerator < 0) return -Math.floor((-numerator + 5000) / 10000);
  return Math.floor((numerator + 5000) / 10000);
}

export interface Totals {
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  itemCount: number;
}

/** CONTRACT §6 pricing rules, re-implemented for the guest (offline) cart. */
export function computeTotals(
  lines: { product: Pick<ProductCard, 'priceCents' | 'freeShipping'>; qty: number }[],
  shippingMethod: ShippingMethod = 'standard',
): Totals {
  const subtotalCents = lines.reduce((sum, l) => sum + l.product.priceCents * l.qty, 0);
  const itemCount = lines.reduce((n, l) => n + l.qty, 0);

  let shippingCents = 0;
  if (lines.length > 0 && subtotalCents < FREE_SHIPPING_THRESHOLD_CENTS) {
    shippingCents = lines.every((l) => l.product.freeShipping)
      ? 0
      : shippingMethod === 'express'
        ? EXPRESS_SHIPPING_CENTS
        : STANDARD_SHIPPING_CENTS;
  }

  const taxCents = percentOfCents(subtotalCents, TAX_BASIS_POINTS);
  return {
    subtotalCents,
    shippingCents,
    taxCents,
    totalCents: subtotalCents + shippingCents + taxCents,
    itemCount,
  };
}

export function buildLines(entries: { product: ProductCard; qty: number }[]): CartLine[] {
  return entries.map(({ product, qty }) => ({
    product,
    qty,
    lineTotalCents: product.priceCents * qty,
    exceedsStock: qty > product.stock,
  }));
}
