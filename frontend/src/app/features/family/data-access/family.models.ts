import { TransactionListItem } from '../../../shared/ui/transaction-list';

export type FamilyUserStatus = 'ACTIVE' | 'PENDING_VERIFICATION' | 'SUSPENDED';

export interface LimitProgress {
  readonly spentMinor: number;
  readonly maxMinor: number;
}

export interface LimitWindow {
  readonly spentMinor: number;
  readonly maxMinor: number;
  readonly remainingMinor: number;
}

export interface FamilyChildLimits {
  readonly today: LimitProgress;
  readonly month: LimitProgress;
  readonly perTransactionMinor: number;
}

export interface FamilyChildDetailLimits {
  readonly today: LimitWindow;
  readonly month: LimitWindow;
  readonly perTransactionMinor: number;
}

export interface FamilyOverview {
  readonly childrenCount: number;
  readonly allocatedThisMonthMinor: number;
  readonly spentThisMonthMinor: number;
  readonly blockedAttempts: number;
}

export interface FamilyChildCard {
  readonly id: string;
  readonly name: string;
  readonly handle: string;
  readonly username: string;
  readonly status: FamilyUserStatus;
  readonly availableMinor: number;
  readonly balanceMinor: number;
  readonly heldMinor: number;
  readonly limits: FamilyChildLimits;
}

export interface FamilyChildDetail {
  readonly id: string;
  readonly name: string;
  readonly handle: string;
  readonly username: string;
  readonly status: FamilyUserStatus;
  readonly walletOpenedAt?: string;
  readonly availableMinor: number;
  readonly balanceMinor: number;
  readonly heldMinor: number;
  readonly allocatedThisMonthMinor: number;
  readonly limits: FamilyChildDetailLimits;
}

export interface ChildActivityPageResult {
  readonly items: readonly TransactionListItem[];
  readonly page: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
  readonly last: boolean;
}

export interface AddChildRequest {
  readonly firstName: string;
  readonly lastName: string;
  readonly username: string;
  readonly password: string;
  readonly confirmPassword: string;
  readonly maxPerTransactionMajor: number;
  readonly dailyLimitMajor: number;
  readonly monthlyLimitMajor: number;
  readonly startingAllocationMajor?: number;
}

export interface AddChildResult {
  readonly id: string;
  readonly username: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly status: FamilyUserStatus;
}

export interface UpdateChildLimitsRequest {
  readonly maxPerTransactionMajor?: number;
  readonly dailyLimitMajor?: number;
  readonly monthlyLimitMajor?: number;
}

export interface FamilyPageData {
  readonly overview: FamilyOverview;
  readonly children: readonly FamilyChildCard[];
}

export type FamilyErrorCode =
  | 'FIELD_REQUIRED'
  | 'USERNAME_INVALID'
  | 'USERNAME_TAKEN'
  | 'PASSWORD_TOO_WEAK'
  | 'PASSWORD_CONFIRMATION_MISMATCH'
  | 'LIMIT_ORDER_INVALID'
  | 'AMOUNT_INVALID'
  | 'RESOURCE_NOT_FOUND'
  | 'UNAUTHENTICATED'
  | 'ACCESS_DENIED'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export class FamilyApiError extends Error {
  readonly status: number;
  readonly code: FamilyErrorCode;
  readonly fieldErrors: readonly { field: string; code: string }[];
  readonly detail?: string;

  constructor(problem: {
    status: number;
    code: string;
    title?: string;
    detail?: string;
    fieldErrors?: readonly { field: string; code: string }[];
  }) {
    super(problem.title ?? problem.code);
    this.name = 'FamilyApiError';
    this.status = problem.status;
    this.code = (problem.code as FamilyErrorCode) || 'UNKNOWN';
    this.fieldErrors = problem.fieldErrors ?? [];
    this.detail = problem.detail;
  }
}
