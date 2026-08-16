/**
 * Money helpers. Everything in this codebase is integer minor units (piastres).
 * Only the Orbit call ever sees major units, because its API takes a BigDecimal.
 */

/** @param {unknown} v */
export function isIntegerCents(v) {
  return typeof v === 'number' && Number.isSafeInteger(v);
}

/**
 * Assert-and-return an integer cents value.
 * @param {number} cents
 * @param {string} [label]
 * @returns {number}
 */
export function assertCents(cents, label = 'amount') {
  if (!isIntegerCents(cents)) {
    throw new TypeError(`${label} must be an integer number of cents, got ${String(cents)}`);
  }
  return cents;
}

/**
 * Cents -> a fixed 2-decimal *string*. This is the canonical representation:
 * every other major-unit conversion is built on top of it, so no binary float
 * ever decides how the money is rendered.
 * @param {number} cents
 * @returns {string} e.g. 104927.72
 */
export function centsToMajorString(cents) {
  assertCents(cents, 'cents');
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${negative ? '-' : ''}${whole}.${String(frac).padStart(2, '0')}`;
}

/**
 * Cents -> a JSON *number* carrying exactly 2 decimals.
 *
 * The value is produced from a string and parsed back with JSON.parse, so the
 * number that reaches the wire is the shortest double that round-trips to the
 * decimal we intended -- never `104927.71999999999`.
 * @param {number} cents
 * @returns {number}
 */
export function centsToMajorNumber(cents) {
  return JSON.parse(centsToMajorString(cents));
}

/**
 * Major units (number or string) -> integer cents, rounded half-up on the
 * decimal string rather than on a float.
 * @param {number|string} major
 * @returns {number}
 */
export function majorToCents(major) {
  const s = typeof major === 'number' ? major.toFixed(10) : String(major).trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) {
    throw new TypeError(`not a decimal amount: ${String(major)}`);
  }
  const negative = s.startsWith('-');
  const [whole, frac = ''] = (negative ? s.slice(1) : s).split('.');
  const padded = (frac + '000').slice(0, 3);
  const thousandths = Number(whole) * 1000 + Number(padded);
  const cents = Math.floor((thousandths + 5) / 10);
  return negative ? -cents : cents;
}

/**
 * Round-half-up percentage of a cents amount, computed in integer space.
 * @param {number} cents
 * @param {number} rateBasisPoints e.g. 1400 for 14%
 * @returns {number}
 */
export function percentOfCents(cents, rateBasisPoints) {
  assertCents(cents, 'cents');
  const numerator = cents * rateBasisPoints;
  // half-up, sign-aware
  if (numerator < 0) return -Math.floor((-numerator + 5000) / 10000);
  return Math.floor((numerator + 5000) / 10000);
}
