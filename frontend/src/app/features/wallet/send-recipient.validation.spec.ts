import { describe, expect, it } from 'vitest';

import { isRecipientReadyForSend } from './send-recipient.validation';

describe('isRecipientReadyForSend', () => {
  it('requires a verified username that matches the current input', () => {
    expect(isRecipientReadyForSend('sara', 'sara', false)).toBe(true);
    expect(isRecipientReadyForSend('@sara', 'sara', false)).toBe(true);
  });

  it('rejects stale verification after the username changes', () => {
    expect(isRecipientReadyForSend('omar', 'sara', false)).toBe(false);
  });

  it('rejects send while validation is in flight', () => {
    expect(isRecipientReadyForSend('sara', 'sara', true)).toBe(false);
  });

  it('rejects send when no recipient has been verified', () => {
    expect(isRecipientReadyForSend('sara', null, false)).toBe(false);
  });
});
