import { Pipe, PipeTransform } from '@angular/core';

const FULL = new Intl.NumberFormat('en-EG', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const WHOLE = new Intl.NumberFormat('en-EG', { maximumFractionDigits: 0 });

/**
 * Integer piastres → an EGP string. All money on the wire is minor units
 * (CONTRACT preamble), so this is the only place a division by 100 happens.
 *
 *   {{ 4599900 | money }}          → "EGP 45,999.00"
 *   {{ 4599900 | money: 'bare' }}  → "45,999.00"
 *   {{ 4599900 | money: 'short' }} → "EGP 45,999"
 */
@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  transform(cents: number | null | undefined, mode: 'full' | 'bare' | 'short' = 'full'): string {
    if (cents === null || cents === undefined || !Number.isFinite(cents)) return '—';
    const major = cents / 100;
    if (mode === 'short') return `EGP ${WHOLE.format(major)}`;
    const formatted = FULL.format(major);
    return mode === 'bare' ? formatted : `EGP ${formatted}`;
  }
}

/** Split for the "big integer, small decimals" price treatment. */
export function splitMoney(cents: number): { whole: string; fraction: string } {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  return {
    whole: `${negative ? '-' : ''}${WHOLE.format(Math.floor(abs / 100))}`,
    fraction: String(abs % 100).padStart(2, '0'),
  };
}
