/** Field validators and normalizers for ORB-001 / ORB-003. */

const NAME_PATTERN = /^[A-Za-z][A-Za-z\s\-']{0,29}$/;
const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,29}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{8,64}$/;

export const AUTH_MESSAGES = {
  required: 'This field is required',
  nameMax: 'Maximum 30 characters',
  nameInvalid: "Use English letters, spaces, hyphens and apostrophes only",
  usernameInvalid: 'Use 3 to 30 letters, numbers, dots, underscores or hyphens',
  usernameTaken: 'That username is already taken',
  usernameAvailable: 'This username is available',
  emailInvalid: 'Enter a valid email address',
  emailTaken: 'An account already exists with this email. Sign in instead?',
  phoneInvalid:
    'Enter a valid Egyptian mobile number — must start 010, 011, 012 or 015',
  phoneTaken: 'An account already exists with this number',
  passwordWeak: 'At least 8 characters, with a letter and a number',
  passwordMax: 'Maximum 64 characters',
  passwordMismatch: 'Passwords do not match',
  invalidCredentials: "Those details don't match an account.",
  accountNotVerified:
    "Confirm your email before signing in. Check your inbox — we've sent a new link if the last one had expired.",
  accountSuspended: 'This account is suspended. Contact support for help.',
  rateLimited: 'Too many attempts. Please try again shortly.',
  networkError: 'Something went wrong. Please try again.',
  sessionExpired: 'Your session has ended. Sign in again to continue.',
  tokenExpired:
    'This link has expired. Confirmation links last 12 hours. We can send you a fresh one straight away.',
  tokenAlreadyUsed:
    'This link is no longer valid. If you asked for a new email, use the link in the most recent one.',
  tokenInvalid: "This confirmation link isn't valid.",
  alreadyVerified: 'This account is already active. You can sign in now.',
  verifiedSuccess:
    'Your email is confirmed and your Orbit wallet is now active. Sign in to get started.',
  resendTooSoon: (seconds: number) =>
    `We sent one recently. Check your inbox, or try again in ${formatCountdown(seconds)}.`,
  resendSent: (email: string) =>
    `We sent a new link to ${email}. The link in the first email no longer works.`,
} as const;

export function formatCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
}

export function normalizeUsername(value: string): string {
  return value.trim().replace(/^@/, '').toLowerCase();
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/**
 * Canonical Egyptian mobile form: +20 followed by 10/11/12/15 + 8 digits.
 * Accepts 010…, +2010…, 002010…, and 10… when the +20 prefix is implied.
 */
export function normalizeEgyptianPhone(value: string): string | null {
  const digits = value.replace(/[\s\-()]/g, '');
  let national: string | null = null;

  if (/^01[0125]\d{8}$/.test(digits)) {
    national = digits.slice(1);
  } else if (/^\+201[0125]\d{8}$/.test(digits)) {
    national = digits.slice(3);
  } else if (/^00201[0125]\d{8}$/.test(digits)) {
    national = digits.slice(4);
  } else if (/^1[0125]\d{8}$/.test(digits)) {
    national = digits;
  }

  return national ? `+20${national}` : null;
}

export function isValidName(value: string): boolean {
  const normalized = normalizeName(value);
  return normalized.length >= 1 && normalized.length <= 30 && NAME_PATTERN.test(normalized);
}

export function isValidUsername(value: string): boolean {
  const normalized = normalizeUsername(value);
  return USERNAME_PATTERN.test(normalized);
}

export function isValidEmail(value: string): boolean {
  const normalized = normalizeEmail(value);
  return normalized.length > 0 && normalized.length <= 255 && EMAIL_PATTERN.test(normalized);
}

export function isValidPassword(value: string): boolean {
  return PASSWORD_PATTERN.test(value);
}

export type FieldKey =
  | 'firstName'
  | 'lastName'
  | 'username'
  | 'email'
  | 'phoneNumber'
  | 'password'
  | 'confirmPassword'
  | 'promoCode';

export type FieldErrors = Partial<Record<FieldKey, string>>;

export function validateRegisterForm(input: {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  phoneNumber: string;
  password: string;
  confirmPassword: string;
  promoCode?: string;
}): FieldErrors {
  const errors: FieldErrors = {};

  if (!input.firstName.trim()) errors.firstName = AUTH_MESSAGES.required;
  else if (input.firstName.trim().length > 30) errors.firstName = AUTH_MESSAGES.nameMax;
  else if (!isValidName(input.firstName)) errors.firstName = AUTH_MESSAGES.nameInvalid;

  if (!input.lastName.trim()) errors.lastName = AUTH_MESSAGES.required;
  else if (input.lastName.trim().length > 30) errors.lastName = AUTH_MESSAGES.nameMax;
  else if (!isValidName(input.lastName)) errors.lastName = AUTH_MESSAGES.nameInvalid;

  if (!input.username.trim()) errors.username = AUTH_MESSAGES.required;
  else if (!isValidUsername(input.username)) errors.username = AUTH_MESSAGES.usernameInvalid;

  if (!input.email.trim()) errors.email = AUTH_MESSAGES.required;
  else if (!isValidEmail(input.email)) errors.email = AUTH_MESSAGES.emailInvalid;

  if (!input.phoneNumber.trim()) errors.phoneNumber = AUTH_MESSAGES.required;
  else if (!normalizeEgyptianPhone(input.phoneNumber)) errors.phoneNumber = AUTH_MESSAGES.phoneInvalid;

  if (!input.password) errors.password = AUTH_MESSAGES.required;
  else if (input.password.length > 64) errors.password = AUTH_MESSAGES.passwordMax;
  else if (!isValidPassword(input.password)) errors.password = AUTH_MESSAGES.passwordWeak;

  if (!input.confirmPassword) errors.confirmPassword = AUTH_MESSAGES.required;
  else if (input.password !== input.confirmPassword) {
    errors.confirmPassword = AUTH_MESSAGES.passwordMismatch;
  }

  if (input.promoCode && input.promoCode.trim().length > 32) {
    errors.promoCode = 'Maximum 32 characters';
  }

  return errors;
}

export function validateLoginForm(input: {
  username: string;
  password: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  if (!input.username.trim()) errors.username = AUTH_MESSAGES.required;
  if (!input.password) errors.password = AUTH_MESSAGES.required;
  return errors;
}
