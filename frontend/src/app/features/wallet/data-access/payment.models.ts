/** Contract DTOs for wallet top-up via Paymob (ORB-006). */

import { ProblemDetails } from '../../auth/data-access/auth.models';

export type PaymentStatus =
  | 'STARTED'
  | 'AWAITING_CONFIRMATION'
  | 'COMPLETED'
  | 'FAILED'
  | 'EXPIRED';

export interface TopUpInitiateRequest {
  /** Major-unit EGP amount (e.g. 500 for EGP 500.00). */
  readonly amount: number;
}

export interface TopUpInitiateResponse {
  readonly paymentId: string;
  readonly redirectUrl: string;
}

export interface PaymentStatusResponse {
  readonly paymentId: string;
  readonly status: PaymentStatus;
}

export interface TopUpSessionContext {
  readonly paymentId: string;
  readonly amountMinor: number;
  readonly initiatedAt: number;
}

export type PaymentErrorCode =
  | 'FIELD_REQUIRED'
  | 'AMOUNT_INVALID'
  | 'AMOUNT_BELOW_MINIMUM'
  | 'AMOUNT_ABOVE_MAXIMUM'
  | 'CHILD_CANNOT_TOP_UP'
  | 'PAYMOB_UNREACHABLE'
  | 'PAYMENT_NOT_FOUND'
  | 'UNAUTHENTICATED'
  | 'ACCESS_DENIED'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export class PaymentApiError extends Error {
  readonly status: number;
  readonly code: PaymentErrorCode;
  readonly fieldErrors: readonly { field: string; code: string }[];
  readonly detail?: string;

  constructor(problem: ProblemDetails) {
    super(problem.title ?? problem.code);
    this.name = 'PaymentApiError';
    this.status = problem.status;
    this.code = (problem.code as PaymentErrorCode) || 'UNKNOWN';
    this.fieldErrors = problem.fieldErrors ?? [];
    this.detail = problem.detail;
  }
}

export function isPendingPaymentStatus(status: PaymentStatus): boolean {
  return status === 'STARTED' || status === 'AWAITING_CONFIRMATION';
}

export function isTerminalPaymentStatus(status: PaymentStatus): boolean {
  return status === 'COMPLETED' || status === 'FAILED' || status === 'EXPIRED';
}
