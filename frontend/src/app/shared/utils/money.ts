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
