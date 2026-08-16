export const TOP_UP_MIN_MINOR = 5000;
export const TOP_UP_MAX_MINOR = 2_000_000;
export const TOP_UP_MAX_MAJOR = 20000;
export const TOP_UP_MAX_INPUT_LENGTH = 5;

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

/** Whole-number top-up input: digits only, capped at TOP_UP_MAX_INPUT_LENGTH. */
export function sanitizeTopUpAmountInput(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, TOP_UP_MAX_INPUT_LENGTH);
}
