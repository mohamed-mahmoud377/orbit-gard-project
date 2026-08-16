import crypto from 'node:crypto';
import { config } from '../config.js';

/**
 * Dummy card processor (CONTRACT §7).
 *
 * The PAN never leaves this module: nothing here logs it, and the only things
 * returned to callers are the brand and the last four digits.
 */

/** @param {string} value */
export function normalizePan(value) {
  return String(value ?? '').replace(/[\s-]/g, '');
}

/**
 * Luhn (mod-10) checksum.
 * @param {string} pan digits only
 */
export function luhnCheck(pan) {
  if (!/^\d{12,19}$/.test(pan)) return false;
  let sum = 0;
  let double = false;
  for (let i = pan.length - 1; i >= 0; i--) {
    let digit = pan.charCodeAt(i) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * Brand from IIN (CONTRACT §7): 4→Visa, 51-55 / 2221-2720→Mastercard,
 * 34 / 37→Amex, 62→UnionPay, else Unknown.
 * @param {string} pan digits only
 */
export function detectBrand(pan) {
  if (/^4/.test(pan)) return 'Visa';
  if (/^5[1-5]/.test(pan)) return 'Mastercard';
  if (/^(222[1-9]|22[3-9]\d|2[3-6]\d\d|27[01]\d|2720)/.test(pan)) return 'Mastercard';
  if (/^3[47]/.test(pan)) return 'Amex';
  if (/^62/.test(pan)) return 'UnionPay';
  return 'Unknown';
}

/**
 * Expiry is valid through the last instant of the stated month.
 * @param {number} month 1-12
 * @param {number} year 4-digit, or 2-digit which is read as 20xx
 * @param {Date} [now]
 */
export function isExpiryValid(month, year, now = new Date()) {
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  if (!Number.isInteger(year)) return false;
  const fullYear = year < 100 ? 2000 + year : year;
  if (fullYear < 1970 || fullYear > 2100) return false;
  // First instant of the month *after* the expiry month, in UTC.
  const expiresAt = Date.UTC(fullYear, month, 1, 0, 0, 0, 0);
  return now.getTime() < expiresAt;
}

/**
 * @param {string} cvv
 * @param {string} brand
 */
export function isCvvValid(cvv, brand) {
  const s = String(cvv ?? '').trim();
  if (!/^\d{3,4}$/.test(s)) return false;
  if (brand === 'Amex') return s.length === 4;
  return s.length === 3;
}

/**
 * Full pre-processing validation. Returns `fieldErrors` shaped for
 * `details.fieldErrors` in the CONTRACT §5 envelope.
 *
 * @param {{cardNumber: string, holderName: string, expMonth: number, expYear: number, cvv: string}} input
 * @param {Date} [now]
 * @returns {{ ok: boolean, fieldErrors: Record<string,string>, brand: string, last4: string }}
 */
export function validateCard(input, now = new Date()) {
  /** @type {Record<string,string>} */
  const fieldErrors = {};
  const pan = normalizePan(input.cardNumber);
  const brand = detectBrand(pan);

  if (!pan) fieldErrors.cardNumber = 'Card number is required';
  else if (!/^\d+$/.test(pan)) fieldErrors.cardNumber = 'Card number must contain digits only';
  else if (!luhnCheck(pan)) fieldErrors.cardNumber = 'Card number is invalid';

  if (!String(input.holderName ?? '').trim()) {
    fieldErrors.holderName = 'Cardholder name is required';
  }

  const month = Number(input.expMonth);
  const year = Number(input.expYear);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    fieldErrors.expMonth = 'Expiry month must be between 1 and 12';
  } else if (!Number.isInteger(year)) {
    fieldErrors.expYear = 'Expiry year is invalid';
  } else if (!isExpiryValid(month, year, now)) {
    fieldErrors.expYear = 'This card has expired';
  }

  if (!isCvvValid(input.cvv, brand)) {
    fieldErrors.cvv = brand === 'Amex' ? 'Amex security codes are 4 digits' : 'Security code must be 3 digits';
  }

  return {
    ok: Object.keys(fieldErrors).length === 0,
    fieldErrors,
    brand,
    last4: pan.slice(-4),
  };
}

/**
 * The scripted test cards from CONTRACT §7. Anything else that passes Luhn is
 * approved.
 * @type {Record<string, {status: number, code: string, message: string}>}
 */
export const TEST_CARDS = {
  '4242424242424242': { status: 200, code: 'APPROVED', message: 'Approved.' },
  '4000000000000002': {
    status: 402,
    code: 'CARD_DECLINED',
    message: 'Your card was declined by the issuer.',
  },
  '4000000000009995': {
    status: 402,
    code: 'CARD_INSUFFICIENT_FUNDS',
    message: "Your card doesn't have enough available funds for this order.",
  },
  '4000000000000069': {
    status: 402,
    code: 'CARD_EXPIRED',
    message: 'Your card has expired. Try a different card.',
  },
  '4000000000000127': {
    status: 402,
    code: 'CARD_INCORRECT_CVC',
    message: "Your card's security code is incorrect.",
  },
  '4000000000000119': {
    status: 502,
    code: 'CARD_PROCESSING_ERROR',
    message: 'The card network had a problem processing your payment. Please try again.',
  },
};

/**
 * Decide the outcome for an already-validated PAN. Pure and instant — the
 * artificial latency lives in `processCard`.
 * @param {string} pan digits only
 */
export function decideOutcome(pan) {
  const scripted = TEST_CARDS[pan];
  if (scripted && scripted.code !== 'APPROVED') {
    return { approved: false, ...scripted };
  }
  return { approved: true, status: 200, code: 'APPROVED', message: 'Approved.' };
}

/** 8 uppercase hex characters, e.g. `A31F09C4`. */
export function generateAuthCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Validate, wait 800-1500 ms so it feels like a real acquirer, then decide.
 *
 * @param {{cardNumber: string, holderName: string, expMonth: number, expYear: number, cvv: string}} input
 * @param {{ now?: Date, skipLatency?: boolean }} [opts]
 */
export async function processCard(input, opts = {}) {
  const validation = validateCard(input, opts.now ?? new Date());
  if (!validation.ok) {
    return { ok: false, kind: 'INVALID', fieldErrors: validation.fieldErrors };
  }

  if (!opts.skipLatency) {
    const span = Math.max(0, config.cardLatencyMaxMs - config.cardLatencyMinMs);
    await sleep(config.cardLatencyMinMs + Math.floor(Math.random() * (span + 1)));
  }

  const pan = normalizePan(input.cardNumber);
  const outcome = decideOutcome(pan);

  if (!outcome.approved) {
    return {
      ok: false,
      kind: 'DECLINED',
      status: outcome.status,
      code: outcome.code,
      message: outcome.message,
      brand: validation.brand,
      last4: validation.last4,
    };
  }

  return {
    ok: true,
    kind: 'APPROVED',
    authCode: generateAuthCode(),
    brand: validation.brand,
    last4: validation.last4,
  };
}
