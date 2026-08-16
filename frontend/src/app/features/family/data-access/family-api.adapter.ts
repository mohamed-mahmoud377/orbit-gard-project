import { TransactionListItem } from '../../../shared/ui/transaction-list';
import { majorUnitsToMinor } from '../../wallet/data-access/wallet-api.adapter';

import {
  AddChildResult,
  FamilyChildCard,
  FamilyChildDetail,
  FamilyChildDetailLimits,
  FamilyChildLimits,
  FamilyOverview,
  FamilyUserStatus,
  LimitProgress,
  LimitWindow,
} from './family.models';

export interface BackendLimitProgressResponse {
  readonly spent: number | string;
  readonly max: number | string;
}

export interface BackendLimitWindowResponse {
  readonly spent: number | string;
  readonly max: number | string;
  readonly remaining: number | string;
}

export interface BackendFamilyChildLimitsResponse {
  readonly today: BackendLimitProgressResponse;
  readonly month: BackendLimitProgressResponse;
  readonly perTransaction: number | string;
}

export interface BackendFamilyChildDetailLimitsResponse {
  readonly today: BackendLimitWindowResponse;
  readonly month: BackendLimitWindowResponse;
  readonly perTransaction: number | string;
}

export interface BackendFamilyOverviewResponse {
  readonly childrenCount: number;
  readonly allocatedThisMonth: number | string;
  readonly spentThisMonth: number | string;
  readonly blockedAttempts: number;
}

export interface BackendFamilyChildResponse {
  readonly id: string;
  readonly name: string;
  readonly handle: string;
  readonly status: string;
  readonly available: number | string;
  readonly balance: number | string;
  readonly held: number | string;
  readonly limits: BackendFamilyChildLimitsResponse;
}

export interface BackendFamilyChildDetailResponse {
  readonly id: string;
  readonly name: string;
  readonly handle: string;
  readonly status: string;
  readonly walletOpenedAt?: string | null;
  readonly available: number | string;
  readonly balance: number | string;
  readonly held: number | string;
  readonly allocatedThisMonth: number | string;
  readonly limits: BackendFamilyChildDetailLimitsResponse;
}

export interface BackendChildTransactionResponse {
  readonly id: string;
  readonly merchant?: string | null;
  readonly reference?: string | null;
  readonly channel?: string | null;
  readonly amount: number | string;
  readonly status: string;
  readonly reason?: string | null;
  readonly occurredAt: string;
}

export interface BackendChildTransactionPageResponse {
  readonly content: readonly BackendChildTransactionResponse[];
  readonly page: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
  readonly first: boolean;
  readonly last: boolean;
}

export interface BackendAddChildResponse {
  readonly id: string;
  readonly username: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly status: string;
}

function normalizeStatus(status: string): FamilyUserStatus {
  if (status === 'PENDING_VERIFICATION' || status === 'SUSPENDED') return status;
  return 'ACTIVE';
}

function stripHandlePrefix(handle: string): string {
  return handle.startsWith('@') ? handle.slice(1) : handle;
}

function normalizeLimitProgress(body: BackendLimitProgressResponse): LimitProgress {
  return {
    spentMinor: majorUnitsToMinor(body.spent),
    maxMinor: majorUnitsToMinor(body.max),
  };
}

function normalizeLimitWindow(body: BackendLimitWindowResponse): LimitWindow {
  return {
    spentMinor: majorUnitsToMinor(body.spent),
    maxMinor: majorUnitsToMinor(body.max),
    remainingMinor: majorUnitsToMinor(body.remaining),
  };
}

function normalizeCardLimits(body: BackendFamilyChildLimitsResponse): FamilyChildLimits {
  return {
    today: normalizeLimitProgress(body.today),
    month: normalizeLimitProgress(body.month),
    perTransactionMinor: majorUnitsToMinor(body.perTransaction),
  };
}

function normalizeDetailLimits(body: BackendFamilyChildDetailLimitsResponse): FamilyChildDetailLimits {
  return {
    today: normalizeLimitWindow(body.today),
    month: normalizeLimitWindow(body.month),
    perTransactionMinor: majorUnitsToMinor(body.perTransaction),
  };
}

export function normalizeFamilyOverview(body: BackendFamilyOverviewResponse): FamilyOverview {
  return {
    childrenCount: body.childrenCount,
    allocatedThisMonthMinor: majorUnitsToMinor(body.allocatedThisMonth),
    spentThisMonthMinor: majorUnitsToMinor(body.spentThisMonth),
    blockedAttempts: body.blockedAttempts,
  };
}

export function normalizeChildCard(body: BackendFamilyChildResponse): FamilyChildCard {
  return {
    id: body.id,
    name: body.name,
    handle: body.handle,
    username: stripHandlePrefix(body.handle),
    status: normalizeStatus(body.status),
    availableMinor: majorUnitsToMinor(body.available),
    balanceMinor: majorUnitsToMinor(body.balance),
    heldMinor: majorUnitsToMinor(body.held),
    limits: normalizeCardLimits(body.limits),
  };
}

export function normalizeChildDetail(body: BackendFamilyChildDetailResponse): FamilyChildDetail {
  return {
    id: body.id,
    name: body.name,
    handle: body.handle,
    username: stripHandlePrefix(body.handle),
    status: normalizeStatus(body.status),
    walletOpenedAt: body.walletOpenedAt ?? undefined,
    availableMinor: majorUnitsToMinor(body.available),
    balanceMinor: majorUnitsToMinor(body.balance),
    heldMinor: majorUnitsToMinor(body.held),
    allocatedThisMonthMinor: majorUnitsToMinor(body.allocatedThisMonth),
    limits: normalizeDetailLimits(body.limits),
  };
}

export function normalizeAddChildResult(body: BackendAddChildResponse): AddChildResult {
  return {
    id: body.id,
    username: body.username,
    firstName: body.firstName,
    lastName: body.lastName,
    status: normalizeStatus(body.status),
  };
}

const CHANNEL_LABELS: Record<string, string> = {
  '/pay': 'Payment',
  '/transfer': 'Transfer',
  '/topup': 'Top-up',
  '/promo': 'Promotional bonus',
};

function channelLabel(channel: string | null | undefined): string {
  if (!channel) return 'Transaction';
  return CHANNEL_LABELS[channel] ?? channel;
}

export function normalizeChildTransaction(
  body: BackendChildTransactionResponse,
): TransactionListItem {
  const amountMinor = majorUnitsToMinor(body.amount);
  return {
    id: body.id,
    title: body.merchant?.trim() || channelLabel(body.channel),
    subtitle: body.reference?.trim() || body.channel || '',
    amount: amountMinor,
    status: body.status.toUpperCase(),
    createdAt: body.occurredAt,
  };
}

export function normalizeChildTransactionPage(
  body: BackendChildTransactionPageResponse,
): {
  items: TransactionListItem[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  last: boolean;
} {
  return {
    items: body.content.map((item) => normalizeChildTransaction(item)),
    page: body.page,
    size: body.size,
    totalElements: body.totalElements,
    totalPages: body.totalPages,
    last: body.last,
  };
}

export function limitProgressPercent(spentMinor: number, maxMinor: number): number {
  if (maxMinor <= 0) return 0;
  return Math.min(100, Math.round((spentMinor / maxMinor) * 100));
}

export function limitProgressDanger(spentMinor: number, maxMinor: number): boolean {
  if (maxMinor <= 0) return false;
  const ratio = spentMinor / maxMinor;
  return spentMinor >= maxMinor || ratio >= 0.9;
}
