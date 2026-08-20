import { ParsedApiProblem } from '../../../core/http/problem-details';

/**
 * The five statuses the backend records, spelled exactly as it returns them.
 *
 * There is no friendlier re-labelling layer between the enum and the screen —
 * what Orbit stores is what the user reads. PENDING and PROCESSING are
 * pre-terminal; COMPLETED, REJECTED and FAILED are terminal and nothing moves
 * out of them.
 */
export type InstapayRequestStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'REJECTED'
  | 'FAILED';

/**
 * Why a receipt was refused. Only ever one per request — the backend stops at
 * the first rule that fails, because the user fixes this by uploading a new
 * image rather than by correcting five fields.
 */
export type InstapayRejectionReason =
  | 'NOT_A_RECEIPT'
  | 'TRANSFER_NOT_SUCCESSFUL'
  | 'NOTHING_READABLE'
  | 'REFERENCE_NOT_VISIBLE'
  | 'DUPLICATE_REFERENCE'
  | 'WRONG_RECIPIENT'
  | 'INVALID_AMOUNT';

/**
 * One row of the requests list.
 *
 * Every optional field below is optional because the backend *omits the key*,
 * not because it sends null: `spring.jackson.default-property-inclusion` is
 * `non_null`, so a PENDING row arrives with no `amount` property at all. Code
 * that tests `amount !== null` will be wrong on the first upload ever made —
 * test for absence instead.
 */
export interface InstapayRequest {
  readonly id: string;
  readonly status: InstapayRequestStatus;
  /** Major units (EGP) as the API sends them. Absent until the receipt is read. */
  readonly amount?: number;
  readonly referenceNumber?: string;
  /** Present only on REJECTED. FAILED never carries one. */
  readonly rejectionReason?: InstapayRejectionReason;
  readonly submittedAt: string;
  readonly resolvedAt?: string;
}

export interface InstapayRequestList {
  readonly content: readonly InstapayRequest[];
  /**
   * True while anything on the list is still PENDING or PROCESSING. The
   * backend computes it from the same statuses the job writes, so the polling
   * rule and the queue cannot drift apart — never re-derive it here.
   */
  readonly anyUnresolved: boolean;
}

export interface InstapayUploadResult {
  readonly id: string;
  readonly status: InstapayRequestStatus;
  readonly createdAt: string;
}

/**
 * Where to send the transfer, and what Orbit will accept.
 *
 * Served from configuration rather than hardcoded in the design, because the
 * number arrives through an environment variable: a frontend that bakes it in
 * is one deploy away from telling users to send real money to an account
 * Orbit no longer watches.
 */
export interface InstapayAccount {
  readonly accountName: string;
  readonly accountNumber: string;
  readonly minAmount: number;
  readonly maxAmount: number;
  readonly maxImageBytes: number;
}

/** Error codes the InstaPay endpoints can return. */
export type InstapayErrorCode =
  | 'EMPTY_FILE'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_IMAGE_TYPE'
  | 'INVALID_IMAGE'
  | 'DUPLICATE_RECEIPT_IMAGE'
  | 'CHILD_CANNOT_TOP_UP'
  | 'MISSING_REQUEST_PARAMETER'
  | 'INSTAPAY_REQUEST_NOT_FOUND'
  | 'UNAUTHENTICATED'
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export class InstapayApiError extends Error {
  readonly status: number;
  readonly code: InstapayErrorCode;
  readonly detail?: string;
  readonly fieldErrors: readonly { field: string; code: string }[];

  constructor(problem: ParsedApiProblem) {
    super(problem.title ?? problem.code);
    this.name = 'InstapayApiError';
    this.status = problem.status;
    this.code = (problem.code as InstapayErrorCode) || 'UNKNOWN';
    this.detail = problem.detail;
    this.fieldErrors = problem.fieldErrors ?? [];
  }
}

/** PENDING and PROCESSING are the two the backend counts in `anyUnresolved`. */
export function isUnresolvedInstapayStatus(status: InstapayRequestStatus): boolean {
  return status === 'PENDING' || status === 'PROCESSING';
}

/**
 * Major units to minor, for the shared money formatter.
 *
 * Rounded rather than truncated: the API sends a JSON number decoded from a
 * BigDecimal, and 20.00 can arrive as 20.000000000000004 through a float.
 */
export function instapayAmountToMinor(amount: number): number {
  return Math.round(amount * 100);
}
