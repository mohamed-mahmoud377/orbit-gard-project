import { SessionApiError } from './session.models';
import {
  bannerMessageFromSessionApi,
  normalizeSessionErrorCode,
} from './session-error.mapper';

describe('session-error.mapper', () => {
  describe('normalizeSessionErrorCode', () => {
    it('maps kebab-case API codes to internal enum values', () => {
      expect(normalizeSessionErrorCode('cannot-sign-out-current-device')).toBe(
        'CANNOT_SIGN_OUT_CURRENT_DEVICE',
      );
      expect(normalizeSessionErrorCode('resource-not-found')).toBe('SESSION_NOT_FOUND');
      expect(normalizeSessionErrorCode('unauthenticated')).toBe('UNAUTHENTICATED');
    });

    it('passes through already-normalized codes', () => {
      expect(normalizeSessionErrorCode('NETWORK_ERROR')).toBe('NETWORK_ERROR');
    });

    it('falls back to UNKNOWN for unrecognized codes', () => {
      expect(normalizeSessionErrorCode('something-else')).toBe('UNKNOWN');
    });
  });

  describe('bannerMessageFromSessionApi', () => {
    it('returns friendly copy for known session errors', () => {
      const error = new SessionApiError({
        status: 409,
        code: 'cannot-sign-out-current-device',
        title: 'Cannot sign out the device you are using',
      });

      expect(bannerMessageFromSessionApi(error)).toBe(
        'You cannot sign out the device you are using.',
      );
    });

    it('uses detail as fallback for unknown errors', () => {
      const error = new SessionApiError({
        status: 500,
        code: 'internal-error',
        detail: 'Server exploded',
      });

      expect(bannerMessageFromSessionApi(error)).toBe('Server exploded');
    });

    it('uses provided fallback when detail is missing', () => {
      const error = new SessionApiError({
        status: 500,
        code: 'internal-error',
      });

      expect(bannerMessageFromSessionApi(error, 'Custom fallback')).toBe('Custom fallback');
    });
  });
});
