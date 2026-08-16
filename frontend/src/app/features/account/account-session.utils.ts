import { normalizeEgyptianPhone } from '../auth/data-access/auth.messages';
import { SessionSummary } from './data-access/session.models';

export function toDisplayPhone(phone: string): string {
  const normalized = normalizeEgyptianPhone(phone);
  if (!normalized) {
    return phone.replace(/^\+20/, '').trim();
  }
  return normalized.slice(3);
}

export function toApiPhone(localValue: string): string {
  return normalizeEgyptianPhone(localValue) ?? localValue.trim();
}

export function isUnrecognisedSession(session: SessionSummary): boolean {
  const label = session.deviceLabel.toLowerCase();
  return label.includes('unrecogn') || label.includes('unknown device');
}

export function formatLastActive(iso: string, currentDevice: boolean): string {
  if (currentDevice) {
    return 'active now';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return 'Last active recently';
  }
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) {
    return 'Last active just now';
  }
  if (minutes < 60) {
    return `Last active ${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `Last active ${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  const days = Math.floor(hours / 24);
  if (days === 1) {
    return 'Last active yesterday';
  }
  if (days < 7) {
    return `Last active ${days} days ago`;
  }
  return `Last active ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}
