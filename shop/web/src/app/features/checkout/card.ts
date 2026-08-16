/**
 * Client-side card helpers mirroring `shop/api/src/services/card-processor.js`.
 *
 * The server validates again — this exists so a shopper gets an inline error
 * the moment they leave the field, instead of after a 1.5 s round-trip.
 */

export type CardBrand = 'Visa' | 'Mastercard' | 'Amex' | 'UnionPay' | 'Unknown';

export function normalisePan(value: string): string {
  return value.replace(/[\s-]/g, '');
}

/** Luhn (mod-10) checksum. */
export function luhnCheck(pan: string): boolean {
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

/** IIN ranges from CONTRACT §7. */
export function detectBrand(pan: string): CardBrand {
  if (/^4/.test(pan)) return 'Visa';
  if (/^5[1-5]/.test(pan)) return 'Mastercard';
  if (/^(222[1-9]|22[3-9]\d|2[3-6]\d\d|27[01]\d|2720)/.test(pan)) return 'Mastercard';
  if (/^3[47]/.test(pan)) return 'Amex';
  if (/^62/.test(pan)) return 'UnionPay';
  return 'Unknown';
}

/** Amex groups 4-6-5; everything else groups in fours. */
export function formatPan(value: string): string {
  const pan = normalisePan(value).replace(/\D/g, '').slice(0, 19);
  if (detectBrand(pan) === 'Amex') {
    return [pan.slice(0, 4), pan.slice(4, 10), pan.slice(10, 15)].filter(Boolean).join(' ');
  }
  return (pan.match(/.{1,4}/g) ?? []).join(' ');
}

export function panMaxLength(brand: CardBrand): number {
  return brand === 'Amex' ? 15 : 19;
}

export function cvvLength(brand: CardBrand): number {
  return brand === 'Amex' ? 4 : 3;
}

/** `1225` / `12/25` → `12/25`, typed left to right. */
export function formatExpiry(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

export function parseExpiry(value: string): { month: number; year: number } | null {
  const match = /^(\d{2})\s*\/?\s*(\d{2}|\d{4})$/.exec(value.trim());
  if (!match) return null;
  const month = Number(match[1]);
  const rawYear = Number(match[2]);
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  return { month, year };
}

/** Valid through the last instant of the stated month, in UTC. */
export function isExpiryValid(month: number, year: number, now = new Date()): boolean {
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  if (!Number.isInteger(year) || year < 1970 || year > 2100) return false;
  return now.getTime() < Date.UTC(year, month, 1, 0, 0, 0, 0);
}

export interface CardDraft {
  number: string;
  expiry: string;
  cvv: string;
  holder: string;
}

export type CardFieldErrors = Partial<Record<keyof CardDraft, string>>;

export function validateCard(draft: CardDraft, now = new Date()): CardFieldErrors {
  const errors: CardFieldErrors = {};
  const pan = normalisePan(draft.number);
  const brand = detectBrand(pan);

  if (!pan) errors.number = 'Enter your card number';
  else if (!/^\d+$/.test(pan)) errors.number = 'Card numbers contain digits only';
  else if (pan.length < 12) errors.number = 'That card number is too short';
  else if (!luhnCheck(pan)) errors.number = "That card number doesn't look right";

  if (!draft.holder.trim()) errors.holder = "Enter the name printed on the card";

  const expiry = parseExpiry(draft.expiry);
  if (!draft.expiry.trim()) errors.expiry = 'Enter the expiry date';
  else if (!expiry) errors.expiry = 'Use the MM/YY format';
  else if (!isExpiryValid(expiry.month, expiry.year, now)) {
    errors.expiry = expiry.month < 1 || expiry.month > 12 ? 'That month is not valid' : 'That card has expired';
  }

  const expectedCvv = cvvLength(brand);
  if (!draft.cvv.trim()) errors.cvv = 'Enter the security code';
  else if (!new RegExp(`^\\d{${expectedCvv}}$`).test(draft.cvv.trim())) {
    errors.cvv =
      brand === 'Amex' ? 'Amex security codes are 4 digits' : 'Security codes are 3 digits';
  }

  return errors;
}

/** The scripted outcomes from CONTRACT §7, surfaced in the test-cards panel. */
export const TEST_CARDS: { number: string; outcome: string; tone: 'good' | 'bad' | 'warn' }[] = [
  { number: '4242 4242 4242 4242', outcome: 'Payment approved', tone: 'good' },
  { number: '4000 0000 0000 0002', outcome: 'Declined by the issuer', tone: 'bad' },
  { number: '4000 0000 0000 9995', outcome: 'Insufficient funds', tone: 'bad' },
  { number: '4000 0000 0000 0069', outcome: 'Card expired', tone: 'bad' },
  { number: '4000 0000 0000 0127', outcome: 'Incorrect security code', tone: 'bad' },
  { number: '4000 0000 0000 0119', outcome: 'Processing error at the network', tone: 'warn' },
];

/**
 * Card failures from CONTRACT §7, expanded into something a shopper can act
 * on. The API's `message` is already user-safe; the `hint` adds the next step.
 */
export const CARD_ERROR_HINTS: Record<string, string> = {
  CARD_DECLINED: 'Your bank turned the payment down. Try another card, or pay with your Orbit wallet.',
  CARD_INSUFFICIENT_FUNDS:
    "There isn't enough available balance on this card. Try a different card or your Orbit wallet.",
  CARD_EXPIRED: 'Check the expiry date on the card, or use a different one.',
  CARD_INCORRECT_CVC: 'Re-enter the 3 or 4 digit code from the back of the card.',
  CARD_PROCESSING_ERROR:
    'The card network had a problem — this one is on them, not you. Nothing was charged. Try again in a moment.',
  CARD_INVALID: 'Check the highlighted fields and try again.',
  RATE_LIMITED: 'Too many attempts in a short time. Wait a few minutes before trying again.',
};
