import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTotals, shippingCents, subtotalCents, taxCents } from '../src/services/pricing.js';

const item = (priceCents, qty = 1, freeShipping = false) => ({ priceCents, qty, freeShipping });

test('subtotal multiplies out every line in integer cents', () => {
  assert.equal(subtotalCents([item(4599900, 2), item(749900, 1)]), 9949700);
  assert.equal(subtotalCents([]), 0);
});

test('shipping is free at or above the 1000 EGP threshold', () => {
  assert.equal(shippingCents([item(99999)], 99999, 'standard'), 5000);
  assert.equal(shippingCents([item(100000)], 100000, 'standard'), 0);
  assert.equal(shippingCents([item(100001)], 100001, 'express'), 0);
});

test('shipping is free when every item is flagged freeShipping', () => {
  const allFree = [item(1000, 1, true), item(2000, 1, true)];
  assert.equal(shippingCents(allFree, 3000, 'standard'), 0);
  assert.equal(shippingCents(allFree, 3000, 'express'), 0);

  // One paid-shipping item is enough to bring the charge back.
  const mixed = [item(1000, 1, true), item(2000, 1, false)];
  assert.equal(shippingCents(mixed, 3000, 'standard'), 5000);
  assert.equal(shippingCents(mixed, 3000, 'express'), 15000);
});

test('an empty cart never accrues shipping', () => {
  assert.equal(shippingCents([], 0, 'express'), 0);
});

test('tax is 14% of subtotal only, rounded half-up', () => {
  assert.equal(taxCents(9199800), 1287972);
  assert.equal(taxCents(0), 0);
  assert.equal(taxCents(50000), 7000);
});

test('computeTotals adds up and shipping is untaxed', () => {
  const totals = computeTotals([item(45999, 1)], { shippingMethod: 'standard' });
  assert.deepEqual(totals, {
    subtotalCents: 45999,
    shippingCents: 5000,
    taxCents: 6440, // 45999 * 0.14 = 6439.86 -> 6440
    discountCents: 0,
    totalCents: 45999 + 5000 + 6440,
    shippingMethod: 'standard',
    itemCount: 1,
  });
});

test('computeTotals reproduces the worked example in the contract', () => {
  // 2 x 4599900 = 9199800 subtotal, 14% VAT = 1287972.
  const totals = computeTotals([item(4599900, 2)]);
  assert.equal(totals.subtotalCents, 9199800);
  assert.equal(totals.taxCents, 1287972);
  assert.equal(totals.shippingCents, 0); // well past the free-shipping threshold
  assert.equal(totals.totalCents, 9199800 + 1287972);
  assert.equal(totals.itemCount, 2);
});

test('an unknown shipping method falls back to standard', () => {
  assert.equal(computeTotals([item(1000)], { shippingMethod: 'teleport' }).shippingCents, 5000);
  assert.equal(computeTotals([item(1000)], { shippingMethod: 'express' }).shippingCents, 15000);
});

test('discounts come off the total, not the taxable base', () => {
  const totals = computeTotals([item(50000, 1)], { discountCents: 1000 });
  assert.equal(totals.taxCents, 7000);
  assert.equal(totals.totalCents, 50000 + 5000 + 7000 - 1000);
});

test('every money field stays an integer', () => {
  const totals = computeTotals([item(3333, 3), item(777, 1)], { shippingMethod: 'express' });
  for (const [key, value] of Object.entries(totals)) {
    if (key.endsWith('Cents')) assert.ok(Number.isInteger(value), `${key} = ${value} is not an integer`);
  }
});
