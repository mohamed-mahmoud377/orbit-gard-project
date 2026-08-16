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

export type WalletErrorCode =
  | 'UNAUTHENTICATED'
  | 'ACCESS_DENIED'
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
