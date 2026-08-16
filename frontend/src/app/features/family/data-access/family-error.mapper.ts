import { AUTH_MESSAGES } from '../../auth/data-access/auth.messages';

import { FAMILY_MESSAGES } from './family.messages';
import { FamilyApiError } from './family.models';

const FIELD_MESSAGE: Record<string, string> = {
  FIELD_REQUIRED: FAMILY_MESSAGES.required,
  NAME_INVALID: FAMILY_MESSAGES.nameInvalid,
  USERNAME_INVALID: FAMILY_MESSAGES.usernameInvalid,
  USERNAME_TAKEN: FAMILY_MESSAGES.usernameTaken,
  PASSWORD_TOO_WEAK: FAMILY_MESSAGES.passwordWeak,
  PASSWORD_CONFIRMATION_MISMATCH: FAMILY_MESSAGES.passwordMismatch,
  PASSWORD_MISMATCH: AUTH_MESSAGES.passwordMismatch,
  LIMIT_ORDER_INVALID: FAMILY_MESSAGES.limitOrderInvalid,
  AMOUNT_INVALID: FAMILY_MESSAGES.amountInvalid,
  AMOUNT_BELOW_MINIMUM: FAMILY_MESSAGES.amountBelowMinimum,
  AMOUNT_ABOVE_MAXIMUM: FAMILY_MESSAGES.amountAboveMaximum,
  limits: FAMILY_MESSAGES.limitsRequired,
  dailyLimit: FAMILY_MESSAGES.limitOrderInvalid,
  monthlyLimit: FAMILY_MESSAGES.limitOrderInvalid,
  maxPerTransaction: FAMILY_MESSAGES.limitOrderInvalid,
};

export function messageForFamilyFieldError(code: string): string {
  return FIELD_MESSAGE[code] ?? FAMILY_MESSAGES.networkError;
}

export function fieldErrorsFromFamilyApi(error: FamilyApiError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const fieldError of error.fieldErrors) {
    result[fieldError.field] = messageForFamilyFieldError(fieldError.code);
  }
  return result;
}

export function bannerMessageFromFamilyError(error: FamilyApiError): string {
  if (error.detail) return error.detail;
  if (error.code === 'RESOURCE_NOT_FOUND') return FAMILY_MESSAGES.childNotFound;
  if (error.code === 'NETWORK_ERROR') return FAMILY_MESSAGES.networkError;
  return error.message || FAMILY_MESSAGES.networkError;
}
