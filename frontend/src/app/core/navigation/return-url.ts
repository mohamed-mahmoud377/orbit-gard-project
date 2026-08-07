/**
 * Accept only same-origin in-app paths (no protocol-relative or external URLs).
 * Returns null when the value is unsafe or unusable.
 */
export function sanitizeReturnUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
  if (trimmed.includes('://')) return null;
  return trimmed;
}

/** Build a login URL that returns to the current location after sign-in. */
export function loginUrlWithReturn(returnUrl: string): string {
  const safe = sanitizeReturnUrl(returnUrl);
  if (!safe) return '/auth/login';
  return `/auth/login?returnUrl=${encodeURIComponent(safe)}`;
}
