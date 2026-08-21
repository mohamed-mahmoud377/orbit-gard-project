export const TOP_UP_MIN_MINOR = 5000;
export const TOP_UP_MAX_MINOR = 2_000_000;
export const TOP_UP_MAX_MAJOR = 20000;
export const TOP_UP_MAX_INPUT_LENGTH = 5;

/** Max digits in the whole-number part of transfer amounts (e.g. 999999.99). */
export const TRANSFER_AMOUNT_MAX_WHOLE_DIGITS = 6;

/**
 * The card top-up service fee, as a percentage of the wallet credit.
 *
 * Mirrors TopUpFee.RATE on the server, which is the authority — the server
 * decides what Paymob is asked for, and this exists only so the summary can
 * show the total before the user commits. Keep the two in step, or the round
 * trip reveals a different number than the screen promised.
 *
 * The InstaPay route has no fee: that money arrives by bank transfer, with no
 * gateway in the middle to pay for.
 */
export const TOP_UP_FEE_PERCENT = 1;

/**
 * The fee in minor units, matching the server's HALF_UP rounding at cent
 * precision. Integer maths throughout, for the same reason the server uses
 * BigDecimal — a float would put a half-piastre between the number shown here
 * and the number actually charged.
 */
export function topUpFeeMinor(creditMinor: number): number {
  return Math.round((creditMinor * TOP_UP_FEE_PERCENT) / 100);
}

/** What the card is charged: the wallet credit plus the fee. */
export function topUpChargeMinor(creditMinor: number): number {
  return creditMinor + topUpFeeMinor(creditMinor);
}

export function formatMoney(minorUnits: number, currency = 'EGP'): string {
  const value = minorUnits / 100;
  return `${currency} ${new Intl.NumberFormat('en-EG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}`;
}

export function parseMoney(value: string): number {
  const normalized = value.replace(/[^\d.]/g, '');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

/** Strip non-numeric input; allow one decimal point with up to two fractional digits. */
export function sanitizeMoneyInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, '');
  if (!cleaned) return '';

  const dotIndex = cleaned.indexOf('.');
  if (dotIndex === -1) return cleaned;

  const whole = cleaned.slice(0, dotIndex);
  const fraction = cleaned.slice(dotIndex + 1).replace(/\./g, '').slice(0, 2);
  return `${whole}.${fraction}`;
}

/** Transfer amount input: digits and one decimal, whole part capped at six digits. */
export function sanitizeTransferAmountInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, '');
  if (!cleaned) return '';

  const dotIndex = cleaned.indexOf('.');
  if (dotIndex === -1) {
    return cleaned.slice(0, TRANSFER_AMOUNT_MAX_WHOLE_DIGITS);
  }

  const whole = cleaned.slice(0, dotIndex).slice(0, TRANSFER_AMOUNT_MAX_WHOLE_DIGITS);
  const fraction = cleaned.slice(dotIndex + 1).replace(/\./g, '').slice(0, 2);
  if (fraction.length === 0 && !cleaned.endsWith('.')) {
    return whole;
  }
  return `${whole}.${fraction}`;
}

/** Whole-number top-up input: digits only, capped at TOP_UP_MAX_INPUT_LENGTH. */
export function sanitizeTopUpAmountInput(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, TOP_UP_MAX_INPUT_LENGTH);
}
