import { TransactionListItem } from '../../../shared/ui/transaction-list';

/**
 * The child's own view of their wallet, from GET /child/*.
 *
 * Deliberately separate from the FamilyChild* models: those describe what a
 * parent sees about a child and are addressed by id, while nothing here takes
 * one — the wallet is resolved from the JWT. Same numbers, different reader.
 */

export interface ChildLimitWindow {
  readonly spentMinor: number;
  readonly maxMinor: number;
  readonly remainingMinor: number;
}

export interface ChildDailyWindow extends ChildLimitWindow {
  /** Server-supplied label for the next cut, e.g. "midnight" — a UTC boundary. */
  readonly resetsAt: string;
}

export interface ChildMonthlyWindow extends ChildLimitWindow {
  /** ISO date (YYYY-MM-DD) of the next cut, in UTC. */
  readonly resetsOn: string;
}

/** A transaction still being checked — money held, not yet spent. */
export interface ChildPendingItem {
  readonly id: string;
  readonly merchant: string;
  readonly amountMinor: number;
  /** HH:mm in UTC, as sent. */
  readonly time: string;
}

export interface ChildWalletSnapshot {
  readonly availableMinor: number;
  readonly balanceMinor: number;
  readonly heldMinor: number;
  readonly today: ChildDailyWindow;
  readonly month: ChildMonthlyWindow;
  readonly perTransactionMinor: number;
  readonly pending: readonly ChildPendingItem[];
  readonly recentActivity: readonly TransactionListItem[];
}

export interface ChildActivitySummary {
  readonly spentTodayMinor: number;
  readonly spentThisMonthMinor: number;
  readonly receivedThisMonthMinor: number;
  readonly blockedCount: number;
}

export interface ChildWalletPageData {
  readonly wallet: ChildWalletSnapshot;
  readonly summary: ChildActivitySummary;
}
