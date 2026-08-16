import test from 'node:test';
import assert from 'node:assert/strict';
import {
  centsToMajorString,
  centsToMajorNumber,
  majorToCents,
  percentOfCents,
  assertCents,
} from '../src/lib/money.js';

test('centsToMajorString always renders exactly two decimals', () => {
  assert.equal(centsToMajorString(0), '0.00');
  assert.equal(centsToMajorString(5), '0.05');
  assert.equal(centsToMajorString(50), '0.50');
  assert.equal(centsToMajorString(100), '1.00');
  assert.equal(centsToMajorString(10492772), '104927.72');
  assert.equal(centsToMajorString(-2550), '-25.50');
});

test('centsToMajorNumber produces a clean JSON number, not a float artefact', () => {
  assert.equal(centsToMajorNumber(10492772), 104927.72);
  assert.equal(JSON.stringify({ cashAmount: centsToMajorNumber(10492772) }), '{"cashAmount":104927.72}');
  assert.equal(JSON.stringify({ cashAmount: centsToMajorNumber(1) }), '{"cashAmount":0.01}');
  assert.equal(JSON.stringify({ cashAmount: centsToMajorNumber(999999999) }), '{"cashAmount":9999999.99}');
});

test('the serialised cashAmount never gains a third decimal digit', () => {
  // JSON numbers cannot carry a trailing zero — 0.70 is written 0.7 — so the
  // invariant is "at most two decimals, and numerically identical to the
  // 2-decimal string". That is exactly what @Digits(fraction = 2) checks on
  // the Spring side, and it is what a naive `cents / 100` breaks.
  for (const cents of [1, 3, 7, 29, 70, 293, 815, 1070, 11070, 70070, 8_150_000, 10_492_772]) {
    const wire = JSON.stringify(centsToMajorNumber(cents));
    assert.match(wire, /^\d+(\.\d{1,2})?$/, `${cents} serialised as ${wire}`);
    assert.equal(Number(wire), Number(centsToMajorString(cents)), `${cents} drifted`);
  }
});

test('summing in major units drifts; summing in cents does not', () => {
  // A single `cents / 100` happens to print cleanly, so the danger is not one
  // division — it is adding major units up. This is the concrete reason totals
  // are accumulated in cents and converted exactly once, at the Orbit boundary.
  const lines = Array.from({ length: 10 }, () => 1070); // 10 x 10.70 EGP
  const drifted = lines.reduce((sum, c) => sum + c / 100, 0);
  assert.notEqual(String(drifted), '107', `expected float drift, got ${drifted}`);

  const exact = centsToMajorNumber(lines.reduce((sum, c) => sum + c, 0));
  assert.equal(exact, 107);
  assert.equal(JSON.stringify({ cashAmount: exact }), '{"cashAmount":107}');
});

test('cents survive a round trip through major units', () => {
  for (const cents of [0, 1, 99, 100, 12345, 999999, 10492772, 123456789]) {
    assert.equal(majorToCents(centsToMajorString(cents)), cents, `round trip failed for ${cents}`);
    assert.equal(majorToCents(centsToMajorNumber(cents)), cents, `numeric round trip failed for ${cents}`);
  }
});

test('majorToCents rounds half-up and rejects nonsense', () => {
  assert.equal(majorToCents('1.005'), 101);
  assert.equal(majorToCents('1.004'), 100);
  assert.equal(majorToCents('0.005'), 1);
  assert.equal(majorToCents(12.5), 1250);
  assert.equal(majorToCents('-2.50'), -250);
  assert.throws(() => majorToCents('abc'), TypeError);
});

test('percentOfCents applies 14% VAT with half-up rounding', () => {
  assert.equal(percentOfCents(9199800, 1400), 1287972);
  assert.equal(percentOfCents(100, 1400), 14);
  assert.equal(percentOfCents(1, 1400), 0); // 0.14 -> 0
  assert.equal(percentOfCents(4, 1400), 1); // 0.56 -> 1
  assert.equal(percentOfCents(0, 1400), 0);
});

test('assertCents refuses fractional or non-numeric money', () => {
  assert.equal(assertCents(1250), 1250);
  assert.throws(() => assertCents(12.5), TypeError);
  assert.throws(() => assertCents('1250'), TypeError);
  assert.throws(() => assertCents(NaN), TypeError);
});
