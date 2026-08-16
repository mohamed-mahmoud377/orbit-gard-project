import { Transaction, WalletSnapshot } from '../../../shared/models';
import { UserAccountSummary } from './user-api.adapter';

export interface WalletTransactionPage {
  readonly transactions: readonly Transaction[];
  readonly page: number;
  readonly totalPages: number;
  readonly totalElements: number;
  readonly last: boolean;
}

export interface DashboardData {
  readonly user: UserAccountSummary;
  readonly wallet: WalletSnapshot;
  readonly recentTransactions: readonly Transaction[];
}

export interface WalletTransactionSummary {
  readonly moneyInMinor: number;
  readonly moneyOutMinor: number;
  readonly heldMinor: number;
  readonly rejectedCount: number;
}

export interface InternalTransferRequest {
  readonly receiverUsername: string;
  readonly amountMajor: number;
}

export interface InternalTransferResult {
  readonly debitReference: string;
  readonly creditReference: string;
  readonly debitStatus: string;
}

export interface LoadedTransactions {
  readonly transactions: readonly Transaction[];
  readonly totalElements: number;
  readonly oldestLoadedPage: number;
  readonly totalPages: number;
}

export type WalletErrorCode =
  | 'UNAUTHENTICATED'
  | 'ACCESS_DENIED'
  | 'INSUFFICIENT_BALANCE'
  | 'RECEIVER_NOT_FOUND'
  | 'SELF_TRANSFER_NOT_ALLOWED'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export class WalletApiError extends Error {
  readonly status: number;
  readonly code: WalletErrorCode;
  readonly detail?: string;

  constructor(problem: { status: number; code: string; title?: string; detail?: string }) {
    super(problem.title ?? problem.code);
    this.name = 'WalletApiError';
    this.status = problem.status;
    this.code = (problem.code as WalletErrorCode) || 'UNKNOWN';
    this.detail = problem.detail;
  }
}
