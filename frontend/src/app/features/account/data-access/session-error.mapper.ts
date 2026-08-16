import { SessionApiError, SessionErrorCode } from './session.models';

const BANNER_MESSAGE: Partial<Record<SessionErrorCode, string>> = {
  CANNOT_SIGN_OUT_CURRENT_DEVICE: 'You cannot sign out the device you are using.',
  SESSION_NOT_FOUND: 'That session is no longer active.',
  UNAUTHENTICATED: 'Sign in again to manage devices.',
  NETWORK_ERROR: 'We could not reach the server. Check your connection and try again.',
  UNKNOWN: 'Something went wrong. Please try again.',
};

export { normalizeSessionErrorCode } from './session.models';

export function bannerMessageFromSessionApi(error: SessionApiError, fallback?: string): string {
  if (error.code !== 'UNKNOWN') {
    const mapped = BANNER_MESSAGE[error.code];
    if (mapped) {
      return mapped;
    }
  }
  return error.detail ?? fallback ?? BANNER_MESSAGE.UNKNOWN ?? 'Something went wrong. Please try again.';
}
