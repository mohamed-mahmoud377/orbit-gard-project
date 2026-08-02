/** Contract DTOs for Identity and Authentication (ORB-001 / 002 / 003). */

export type AccountStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED';
export type AccountType = 'USER' | 'CHILD';

export type UsernameAvailabilityReason = 'TAKEN' | 'INVALID' | null;

export interface UsernameAvailabilityResponse {
  readonly username: string;
  readonly available: boolean;
  readonly reason: UsernameAvailabilityReason;
}

export interface RegisterRequest {
  readonly firstName: string;
  readonly lastName: string;
  readonly username: string;
  readonly email: string;
  readonly phoneNumber: string;
  readonly password: string;
  readonly confirmPassword: string;
  readonly promoCode?: string;
}

export interface RegisterResponse {
  readonly id: number;
  readonly username: string;
  readonly email: string;
  readonly status: AccountStatus;
  readonly createdAt: string;
}

export interface VerifyRequest {
  readonly token: string;
}

export interface VerifyResponse {
  readonly username: string;
  readonly status: AccountStatus;
  readonly activatedAt: string;
  /** Present when the account was already active (HTTP 200 ALREADY_VERIFIED). */
  readonly alreadyVerified?: boolean;
}

export interface ResendVerifyRequest {
  readonly email: string;
}

export interface ResendVerifyResponse {
  readonly message: string;
  readonly retryAfterSeconds: number;
}

export interface LoginRequest {
  readonly username: string;
  readonly password: string;
  readonly rememberMe?: boolean;
}

export interface AuthUserSummary {
  readonly id: number;
  readonly username: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly accountType: AccountType;
}

export interface LoginResponse {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly tokenType: 'Bearer';
  readonly expiresIn: number;
  readonly user: AuthUserSummary;
}

export interface ProblemFieldError {
  readonly field: string;
  readonly code: string;
}

export interface ProblemDetails {
  readonly type?: string;
  readonly title?: string;
  readonly status: number;
  readonly code: string;
  readonly detail?: string;
  readonly instance?: string;
  readonly timestamp?: string;
  readonly traceId?: string;
  readonly fieldErrors?: readonly ProblemFieldError[];
  readonly retryAfterSeconds?: number;
}

export type AuthErrorCode =
  | 'FIELD_REQUIRED'
  | 'NAME_INVALID'
  | 'USERNAME_INVALID'
  | 'USERNAME_TAKEN'
  | 'EMAIL_INVALID'
  | 'EMAIL_TAKEN'
  | 'PHONE_INVALID'
  | 'PHONE_NOT_EGYPTIAN'
  | 'PHONE_TAKEN'
  | 'PASSWORD_TOO_WEAK'
  | 'PASSWORD_MISMATCH'
  | 'RATE_LIMITED'
  | 'TOKEN_INVALID'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_ALREADY_USED'
  | 'ALREADY_VERIFIED'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_NOT_VERIFIED'
  | 'ACCOUNT_SUSPENDED'
  | 'TOO_MANY_ATTEMPTS'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export class AuthApiError extends Error {
  readonly status: number;
  readonly code: AuthErrorCode;
  readonly fieldErrors: readonly ProblemFieldError[];
  readonly retryAfterSeconds?: number;
  readonly detail?: string;

  constructor(problem: ProblemDetails) {
    super(problem.title ?? problem.code);
    this.name = 'AuthApiError';
    this.status = problem.status;
    this.code = (problem.code as AuthErrorCode) || 'UNKNOWN';
    this.fieldErrors = problem.fieldErrors ?? [];
    this.retryAfterSeconds = problem.retryAfterSeconds;
    this.detail = problem.detail;
  }
}

export interface StoredAuthSession {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly tokenType: 'Bearer';
  readonly expiresAt: number;
  readonly user: AuthUserSummary;
  readonly rememberMe: boolean;
}
