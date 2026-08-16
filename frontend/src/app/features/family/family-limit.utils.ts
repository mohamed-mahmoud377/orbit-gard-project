import { formatMoney } from '../../shared/utils/money';
import {
  limitProgressDanger,
  limitProgressPercent,
} from './data-access/family-api.adapter';

export { limitProgressDanger, limitProgressPercent };

export function childInitials(name: string): string {
  return (
    name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2) || 'CH'
  );
}

export function limitProgressLabel(spentMinor: number, maxMinor: number): string {
  return `${formatMoney(spentMinor)} of ${formatMoney(maxMinor)}`;
}

export function statusPillClass(status: string): string {
  switch (status) {
    case 'ACTIVE':
      return 'pill pill-completed';
    case 'SUSPENDED':
      return 'pill pill-rejected';
    default:
      return 'pill pill-pending';
  }
}

export function statusLabel(status: string): string {
  switch (status) {
    case 'PENDING_VERIFICATION':
      return 'PENDING';
    default:
      return status;
  }
}

export function blockedAttemptsLabel(count: number): string {
  if (count === 0) return 'No attempts';
  if (count === 1) return '1 attempt';
  return `${count} attempts`;
}

export function childDetailSubtitle(walletOpenedAt?: string): string {
  if (!walletOpenedAt) {
    return 'Limits and activity';
  }
  const opened = new Date(walletOpenedAt);
  if (Number.isNaN(opened.getTime())) {
    return 'Limits and activity';
  }
  const formatted = opened.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return `Wallet opened ${formatted} · Limits and activity`;
}
