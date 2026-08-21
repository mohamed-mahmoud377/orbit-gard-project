import { AUTH_MESSAGES } from '../../auth/data-access/auth.messages';

export const TRANSFER_MIN_MAJOR = 0.01;
export const TRANSFER_MAX_MAJOR = 100_000;

export const FAMILY_MESSAGES = {
  networkError: 'We could not reach Orbit. Check your connection and try again.',
  loadFamilyError: 'We could not load your family wallets right now. Please try again shortly.',
  loadChildError: 'We could not load this child wallet right now. Please try again shortly.',
  loadActivityError: 'We could not load activity right now. Please try again shortly.',
  childNotFound: 'Child wallet not found.',
  // Second person: these are what a child reads about their own wallet, so
  // they never say "child wallet" the way the parent-facing copy above does.
  loadMyWalletError: 'We could not load your wallet right now. Please try again shortly.',
  loadMyActivityError: 'We could not load your activity right now. Please try again shortly.',
  limitsUpdated: 'Limits updated.',
  limitsSaveFailed: 'We could not save these limits. Please try again.',
  fundSuccess: 'Money added to the child wallet.',
  addChildFailed: 'We could not create this child wallet. Please try again.',
  limitOrderInvalid:
    'Per-transaction limit must be at most the daily limit, and daily at most the monthly limit.',
  amountInvalid: 'Enter a valid amount.',
  amountBelowMinimum: `Minimum amount is EGP ${TRANSFER_MIN_MAJOR.toFixed(2)}.`,
  amountAboveMaximum: `Maximum amount is EGP ${TRANSFER_MAX_MAJOR.toLocaleString('en-EG')}.`,
  limitsRequired: 'Enter at least one limit to update.',
  required: AUTH_MESSAGES.required,
  nameInvalid: AUTH_MESSAGES.nameInvalid,
  usernameInvalid: AUTH_MESSAGES.usernameInvalid,
  usernameTaken: AUTH_MESSAGES.usernameTaken,
  passwordWeak: AUTH_MESSAGES.passwordWeak,
  passwordMismatch: AUTH_MESSAGES.passwordMismatch,
} as const;
