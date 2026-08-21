import { majorUnitsToMinor } from '../../wallet/data-access/wallet-api.adapter';

import {
  BackendChildTransactionResponse,
  normalizeChildTransaction,
} from './family-api.adapter';
import {
  ChildActivitySummary,
  ChildDailyWindow,
  ChildMonthlyWindow,
  ChildPendingItem,
  ChildWalletSnapshot,
} from './child-self.models';

export interface BackendChildLimitWindowResponse {
  readonly spent: number | string;
  readonly max: number | string;
  readonly remaining: number | string;
}

export interface BackendChildDailyWindowResponse extends BackendChildLimitWindowResponse {
  readonly resetsAt: string;
}

export interface BackendChildMonthlyWindowResponse extends BackendChildLimitWindowResponse {
  readonly resetsOn: string;
}

export interface BackendChildPendingItemResponse {
  readonly id: string;
  readonly merchant?: string | null;
  readonly amount: number | string;
  readonly time: string;
}

export interface BackendChildWalletResponse {
  readonly available: number | string;
  readonly balance: number | string;
  readonly held: number | string;
  readonly today: BackendChildDailyWindowResponse;
  readonly month: BackendChildMonthlyWindowResponse;
  readonly perTransaction: number | string;
  readonly pending: readonly BackendChildPendingItemResponse[];
  readonly recentActivity: readonly BackendChildTransactionResponse[];
}

export interface BackendChildActivitySummaryResponse {
  readonly spentToday: number | string;
  readonly spentThisMonth: number | string;
  readonly receivedThisMonth: number | string;
  readonly blockedCount: number;
}

function normalizeDailyWindow(body: BackendChildDailyWindowResponse): ChildDailyWindow {
  return {
    spentMinor: majorUnitsToMinor(body.spent),
    maxMinor: majorUnitsToMinor(body.max),
    remainingMinor: majorUnitsToMinor(body.remaining),
    resetsAt: body.resetsAt,
  };
}

function normalizeMonthlyWindow(body: BackendChildMonthlyWindowResponse): ChildMonthlyWindow {
  return {
    spentMinor: majorUnitsToMinor(body.spent),
    maxMinor: majorUnitsToMinor(body.max),
    remainingMinor: majorUnitsToMinor(body.remaining),
    resetsOn: body.resetsOn,
  };
}

function normalizePendingItem(body: BackendChildPendingItemResponse): ChildPendingItem {
  return {
    id: body.id,
    // The server derives this from the description and can legitimately have
    // nothing to show — a pending row with a blank title reads as broken.
    merchant: body.merchant?.trim() || 'Being checked',
    amountMinor: majorUnitsToMinor(body.amount),
    time: body.time,
  };
}

export function normalizeChildWallet(body: BackendChildWalletResponse): ChildWalletSnapshot {
  return {
    availableMinor: majorUnitsToMinor(body.available),
    balanceMinor: majorUnitsToMinor(body.balance),
    heldMinor: majorUnitsToMinor(body.held),
    today: normalizeDailyWindow(body.today),
    month: normalizeMonthlyWindow(body.month),
    perTransactionMinor: majorUnitsToMinor(body.perTransaction),
    pending: (body.pending ?? []).map((item) => normalizePendingItem(item)),
    // Same row shape as the parent's feed, so the same normalizer applies —
    // including the direction-to-sign step every consumer would otherwise redo.
    recentActivity: (body.recentActivity ?? []).map((item) => normalizeChildTransaction(item)),
  };
}

export function normalizeChildActivitySummary(
  body: BackendChildActivitySummaryResponse,
): ChildActivitySummary {
  return {
    spentTodayMinor: majorUnitsToMinor(body.spentToday),
    spentThisMonthMinor: majorUnitsToMinor(body.spentThisMonth),
    receivedThisMonthMinor: majorUnitsToMinor(body.receivedThisMonth),
    blockedCount: body.blockedCount,
  };
}

/**
 * "Resets on 1 September" from the ISO date the server sends. Parsed as UTC to
 * match the window it describes: a local-time parse can land on the previous
 * day for anyone west of Greenwich.
 */
export function monthlyResetLabel(resetsOn: string): string {
  const parsed = new Date(`${resetsOn}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return 'Resets at the start of next month';
  }
  const formatted = parsed.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
  return `Resets on ${formatted}`;
}

export function dailyResetLabel(resetsAt: string): string {
  return resetsAt ? `Resets at ${resetsAt}` : 'Resets at midnight';
}
