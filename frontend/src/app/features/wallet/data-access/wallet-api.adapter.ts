import { Transaction, TransactionStatus, TransactionType, WalletSnapshot } from '../../../shared/models';

import { InternalTransferResult, WalletTransactionSummary } from './wallet.models';

export function majorUnitsToMinor(value: number | string): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
}

export function minorUnitsToMajor(minor: number): number {
  return minor / 100;
}

export interface BackendWalletBalanceResponse {
  readonly balance: number | string;
  readonly held: number | string;
  readonly available: number | string;
}

export interface BackendWalletTransactionSummaryResponse {
  readonly moneyInThisMonth: number | string;
  readonly moneyOutThisMonth: number | string;
  readonly currentlyHeld: number | string;
  readonly rejectedCount: number;
}

export interface BackendInternalTransferResponse {
  readonly debitTransactionId: string;
  readonly debitReference: string;
  readonly creditTransactionId: string;
  readonly creditReference: string;
  readonly debitStatus: string;
}

export interface BackendWalletTransactionResponse {
  readonly id: string;
  readonly type: string;
  readonly direction: string;
  readonly status: string;
  readonly amount: number | string;
  readonly balanceBefore?: number | string;
  readonly balanceAfter?: number | string;
  readonly reference?: string;
  readonly transactionPublicId?: string;
  readonly description?: string;
  readonly counterparty?: string | null;
  readonly createdAt?: string;
  readonly resolvedAt?: string | null;
}

export interface BackendWalletTransactionPageResponse {
  readonly content: readonly BackendWalletTransactionResponse[];
  readonly page: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
  readonly first: boolean;
  readonly last: boolean;
}

export function normalizeWalletBalance(body: BackendWalletBalanceResponse): WalletSnapshot {
  return {
    currency: 'EGP',
    totalMinor: majorUnitsToMinor(body.balance),
    heldMinor: majorUnitsToMinor(body.held),
    availableMinor: majorUnitsToMinor(body.available),
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeTransactionSummary(
  body: BackendWalletTransactionSummaryResponse,
): WalletTransactionSummary {
  return {
    moneyInMinor: majorUnitsToMinor(body.moneyInThisMonth),
    moneyOutMinor: majorUnitsToMinor(body.moneyOutThisMonth),
    heldMinor: majorUnitsToMinor(body.currentlyHeld),
    rejectedCount: body.rejectedCount,
  };
}

export function normalizeInternalTransfer(
  body: BackendInternalTransferResponse,
): InternalTransferResult {
  return {
    debitReference: body.debitReference,
    creditReference: body.creditReference,
    debitStatus: body.debitStatus,
  };
}

function mapTransactionType(type: string, direction: string): TransactionType {
  if (type === 'TOPUP' || type === 'PROMO') return 'top-up';
  if (type === 'INTERNAL_TRANSFER') {
    return direction === 'CREDIT' ? 'transfer-in' : 'transfer-out';
  }
  if (type === 'EXTERNAL_TRANSFER') return 'merchant-payment';
  return direction === 'CREDIT' ? 'transfer-in' : 'transfer-out';
}

function mapTransactionStatus(status: string): TransactionStatus {
  if (status === 'PENDING') return 'pending';
  if (status === 'REJECTED') return 'rejected';
  return 'completed';
}

export function normalizeWalletTransaction(
  body: BackendWalletTransactionResponse,
  walletOwnerId = '',
): Transaction {
  const reference = body.reference ?? body.transactionPublicId;
  return {
    id: reference ?? body.id,
    backendId: body.id,
    walletOwnerId,
    type: mapTransactionType(body.type, body.direction),
    status: mapTransactionStatus(body.status),
    amountMinor: majorUnitsToMinor(body.amount),
    currency: 'EGP',
    title: body.description ?? body.type,
    subtitle: body.counterparty ?? reference ?? '',
    occurredAt: body.createdAt ?? new Date().toISOString(),
    balanceBeforeMinor:
      body.balanceBefore != null ? majorUnitsToMinor(body.balanceBefore) : undefined,
    balanceAfterMinor:
      body.balanceAfter != null ? majorUnitsToMinor(body.balanceAfter) : undefined,
    resolvedAt: body.resolvedAt ?? undefined,
  };
}

export function normalizeWalletTransactionPage(
  body: BackendWalletTransactionPageResponse,
  walletOwnerId = '',
): Transaction[] {
  return body.content.map((item) => normalizeWalletTransaction(item, walletOwnerId));
}

export function sortTransactionsNewestFirst(
  transactions: readonly Transaction[],
): Transaction[] {
  return [...transactions].sort(
    (left, right) =>
      new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime(),
  );
}
