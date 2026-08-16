export interface ChangePasswordRequest {
  readonly currentPassword: string;
  readonly newPassword: string;
  readonly confirmNewPassword: string;
}

export interface ChangePasswordResponse {
  readonly message: string;
  readonly devicesSignedOut: number;
}

export type PasswordErrorCode =
  | 'FIELD_REQUIRED'
  | 'PASSWORD_TOO_WEAK'
  | 'PASSWORD_MISMATCH'
  | 'PASSWORD_INVALID'
  | 'PASSWORD_CONFIRMATION_MISMATCH'
  | 'UNAUTHENTICATED'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export class PasswordApiError extends Error {
  readonly status: number;
  readonly code: PasswordErrorCode;
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
    this.name = 'PasswordApiError';
    this.status = problem.status;
    this.code = (problem.code as PasswordErrorCode) || 'UNKNOWN';
    this.fieldErrors = problem.fieldErrors ?? [];
    this.detail = problem.detail;
  }
}
