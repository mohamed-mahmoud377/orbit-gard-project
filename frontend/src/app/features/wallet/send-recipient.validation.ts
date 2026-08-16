import { normalizeUsername } from '../auth/data-access/auth.messages';

/** Whether the send button can target the currently verified recipient. */
export function isRecipientReadyForSend(
  inputUsername: string,
  verifiedUsername: string | null,
  validating: boolean,
): boolean {
  if (validating || !verifiedUsername) {
    return false;
  }
  return normalizeUsername(inputUsername) === verifiedUsername;
}
