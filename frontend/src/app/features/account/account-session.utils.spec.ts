import { describe, expect, it } from 'vitest';

import {
  formatLastActive,
  isUnrecognisedSession,
  toApiPhone,
  toDisplayPhone,
} from './account-session.utils';

describe('account-session.utils', () => {
  it('converts API phone numbers to local display values', () => {
    expect(toDisplayPhone('+201012345678')).toBe('1012345678');
  });

  it('converts local phone input back to API form', () => {
    expect(toApiPhone('1012345678')).toBe('+201012345678');
  });

  it('detects unrecognised sessions from the device label', () => {
    expect(
      isUnrecognisedSession({
        id: '1',
        deviceLabel: 'Unrecognised device · Firefox 132',
        location: null,
        lastUsedAt: '2026-07-25T10:00:00Z',
        currentDevice: false,
      }),
    ).toBe(true);
  });

  it('formats current device activity as active now', () => {
    expect(formatLastActive('2026-07-25T10:00:00Z', true)).toBe('active now');
  });
});
