export interface ProfileDetails {
  readonly firstName: string;
  readonly lastName: string;
  readonly username: string;
  readonly email: string;
  readonly phoneNumber: string;
  readonly nonRevokedSessionCount?: number;
}

export interface UpdateProfileRequest {
  readonly firstName: string;
  readonly lastName: string;
  readonly phoneNumber: string;
  readonly username: string;
}

export type ProfileErrorCode =
  | 'FIELD_REQUIRED'
  | 'NAME_INVALID'
  | 'PHONE_INVALID'
  | 'PHONE_NOT_EGYPTIAN'
  | 'UNAUTHENTICATED'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export class ProfileApiError extends Error {
  readonly status: number;
  readonly code: ProfileErrorCode;
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
    this.name = 'ProfileApiError';
    this.status = problem.status;
    this.code = (problem.code as ProfileErrorCode) || 'UNKNOWN';
    this.fieldErrors = problem.fieldErrors ?? [];
    this.detail = problem.detail;
  }
}
