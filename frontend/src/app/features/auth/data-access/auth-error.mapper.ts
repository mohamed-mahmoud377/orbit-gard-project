import { AUTH_MESSAGES, formatCountdown } from './auth.messages';
import { AuthApiError, AuthErrorCode, ProblemFieldError } from './auth.models';

const FIELD_MESSAGE: Record<string, string> = {
  FIELD_REQUIRED: AUTH_MESSAGES.required,
  NAME_INVALID: AUTH_MESSAGES.nameInvalid,
  USERNAME_INVALID: AUTH_MESSAGES.usernameInvalid,
  USERNAME_TAKEN: AUTH_MESSAGES.usernameTaken,
  EMAIL_INVALID: AUTH_MESSAGES.emailInvalid,
  EMAIL_TAKEN: AUTH_MESSAGES.emailTaken,
  PHONE_INVALID: AUTH_MESSAGES.phoneInvalid,
  PHONE_NOT_EGYPTIAN: AUTH_MESSAGES.phoneInvalid,
  PHONE_TAKEN: AUTH_MESSAGES.phoneTaken,
  PASSWORD_TOO_WEAK: AUTH_MESSAGES.passwordWeak,
  PASSWORD_MISMATCH: AUTH_MESSAGES.passwordMismatch,
};

const BANNER_MESSAGE: Partial<Record<AuthErrorCode, string>> = {
  INVALID_CREDENTIALS: AUTH_MESSAGES.invalidCredentials,
  ACCOUNT_NOT_VERIFIED: AUTH_MESSAGES.accountNotVerified,
  ACCOUNT_SUSPENDED: AUTH_MESSAGES.accountSuspended,
  RATE_LIMITED: AUTH_MESSAGES.rateLimited,
  TOO_MANY_ATTEMPTS: AUTH_MESSAGES.rateLimited,
  TOKEN_EXPIRED: AUTH_MESSAGES.tokenExpired,
  TOKEN_ALREADY_USED: AUTH_MESSAGES.tokenAlreadyUsed,
  TOKEN_INVALID: AUTH_MESSAGES.tokenInvalid,
  ALREADY_VERIFIED: AUTH_MESSAGES.alreadyVerified,
  INVALID_REFRESH_TOKEN: AUTH_MESSAGES.sessionExpired,
  NETWORK_ERROR: AUTH_MESSAGES.networkError,
  UNKNOWN: AUTH_MESSAGES.networkError,
};

export function messageForFieldError(error: ProblemFieldError): string {
  return FIELD_MESSAGE[error.code] ?? AUTH_MESSAGES.networkError;
}

export function fieldErrorsFromApi(
  error: AuthApiError,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const fieldError of error.fieldErrors) {
    result[fieldError.field] = messageForFieldError(fieldError);
  }
  return result;
}

export function bannerMessageFromApi(error: AuthApiError): string {
  if (error.code === 'RATE_LIMITED' && error.retryAfterSeconds != null) {
    return AUTH_MESSAGES.resendTooSoon(error.retryAfterSeconds);
  }
  return BANNER_MESSAGE[error.code] ?? AUTH_MESSAGES.networkError;
}

export { formatCountdown };
