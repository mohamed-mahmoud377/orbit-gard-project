import { Injectable } from '@angular/core';
import { Observable, delay, of, throwError } from 'rxjs';

import {
  isValidEmail,
  isValidName,
  isValidPassword,
  isValidUsername,
  normalizeEgyptianPhone,
  normalizeEmail,
  normalizeName,
  normalizeUsername,
} from './auth.messages';
import { AuthGateway } from './auth.gateway';
import {
  AuthApiError,
  LoginRequest,
  LoginResponse,
  PasswordResetRequest,
  PasswordResetRequestResponse,
  PasswordResetConfirmRequest,
  PasswordResetConfirmResponse,
  ProblemDetails,
  ProblemFieldError,
  RefreshTokenRequest,
  RegisterRequest,
  RegisterResponse,
  ResendVerifyRequest,
  ResendVerifyResponse,
  UsernameAvailabilityResponse,
  VerifyRequest,
  VerifyResponse,
} from './auth.models';

interface MockAccount {
  id: number;
  accountType: 'USER' | 'CHILD';
  status: 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED';
  firstName: string;
  lastName: string;
  username: string;
  email: string | null;
  phoneNumber: string | null;
  password: string;
  promoCodeEntered: string | null;
  createdAt: string;
  activatedAt: string | null;
}

interface MockToken {
  id: number;
  userId: number;
  rawToken: string;
  purpose: 'EMAIL_VERIFICATION';
  targetEmail: string;
  expiresAt: number;
  consumedAt: number | null;
  createdAt: number;
}

interface MockAuthState {
  accounts: MockAccount[];
  tokens: MockToken[];
  nextAccountId: number;
  nextTokenId: number;
}

const STORAGE_KEY = 'orbit.auth-mock.v1';
const RESEND_COOLDOWN_MS = 120_000;
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

/** Seed accounts used by the mock gateway and wallet demo seam. */
export const MOCK_AUTH_SEED = {
  parent: {
    username: 'mohamed',
    password: 'Orbit@123',
    email: 'mohamed@orbit.demo',
    phone: '+201005550101',
  },
  child: {
    username: 'youssef',
    password: 'Youssef@123',
  },
} as const;

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function problem(
  status: number,
  code: string,
  fieldErrors: readonly ProblemFieldError[] = [],
  extra: Partial<ProblemDetails> = {},
): AuthApiError {
  return new AuthApiError({
    type: `https://orbit.local/errors/${code.toLowerCase().replaceAll('_', '-')}`,
    title: code,
    status,
    code,
    timestamp: nowIso(),
    fieldErrors,
    ...extra,
  });
}

function createSeedState(): MockAuthState {
  const createdAt = '2026-01-10T08:30:00Z';
  return {
    nextAccountId: 10,
    nextTokenId: 10,
    accounts: [
      {
        id: 1,
        accountType: 'USER',
        status: 'ACTIVE',
        firstName: 'Mohamed',
        lastName: 'Mahmoud',
        username: MOCK_AUTH_SEED.parent.username,
        email: MOCK_AUTH_SEED.parent.email,
        phoneNumber: MOCK_AUTH_SEED.parent.phone,
        password: MOCK_AUTH_SEED.parent.password,
        promoCodeEntered: null,
        createdAt,
        activatedAt: createdAt,
      },
      {
        id: 2,
        accountType: 'CHILD',
        status: 'ACTIVE',
        firstName: 'Youssef',
        lastName: 'Mahmoud',
        username: MOCK_AUTH_SEED.child.username,
        email: null,
        phoneNumber: null,
        password: MOCK_AUTH_SEED.child.password,
        promoCodeEntered: null,
        createdAt: '2026-02-02T10:00:00Z',
        activatedAt: '2026-02-02T10:00:00Z',
      },
      {
        id: 3,
        accountType: 'USER',
        status: 'ACTIVE',
        firstName: 'Sara',
        lastName: 'Ibrahim',
        username: 'sara',
        email: 'sara@orbit.demo',
        phoneNumber: '+201001112233',
        password: 'Sara@123',
        promoCodeEntered: null,
        createdAt: '2026-04-10T08:30:00Z',
        activatedAt: '2026-04-10T08:30:00Z',
      },
    ],
    tokens: [],
  };
}

function loadState(): MockAuthState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createSeedState();
    const parsed = JSON.parse(raw) as MockAuthState;
    if (!Array.isArray(parsed.accounts) || !Array.isArray(parsed.tokens)) {
      return createSeedState();
    }
    return parsed;
  } catch {
    return createSeedState();
  }
}

function saveState(state: MockAuthState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

@Injectable({ providedIn: 'root' })
export class MockAuthGateway implements AuthGateway {
  private state = loadState();

  /** Exposed for e2e / unit tests to inspect issued verification tokens. */
  peekLatestToken(email: string): string | null {
    const normalized = normalizeEmail(email);
    const token = [...this.state.tokens]
      .filter((item) => item.targetEmail === normalized && item.consumedAt === null)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    return token?.rawToken ?? null;
  }

  /** Test helper: expire the newest unconsumed token for an email. */
  expireLatestToken(email: string): void {
    const normalized = normalizeEmail(email);
    const token = [...this.state.tokens]
      .filter((item) => item.targetEmail === normalized && item.consumedAt === null)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!token) return;
    token.expiresAt = Date.now() - 1_000;
    this.persist();
  }

  /** Test helper: make the newest token old enough that resend is allowed. */
  ageLatestTokenBeyondCooldown(email: string): void {
    const normalized = normalizeEmail(email);
    const token = [...this.state.tokens]
      .filter((item) => item.targetEmail === normalized)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!token) return;
    token.createdAt = Date.now() - RESEND_COOLDOWN_MS - 1_000;
    this.persist();
  }

  reset(): void {
    this.state = createSeedState();
    this.persist();
  }

  checkUsername(username: string): Observable<UsernameAvailabilityResponse> {
    const normalized = normalizeUsername(username);
    if (!normalized) {
      return this.fail(problem(400, 'FIELD_REQUIRED', [{ field: 'username', code: 'FIELD_REQUIRED' }]));
    }
    if (!isValidUsername(normalized)) {
      return of({ username: normalized, available: false, reason: 'INVALID' as const }).pipe(
        delay(120),
      );
    }
    const taken = this.state.accounts.some((account) => account.username === normalized);
    return of({
      username: normalized,
      available: !taken,
      reason: taken ? ('TAKEN' as const) : null,
    }).pipe(delay(120));
  }

  register(request: RegisterRequest): Observable<RegisterResponse> {
    const fieldErrors: ProblemFieldError[] = [];

    const firstName = normalizeName(request.firstName);
    const lastName = normalizeName(request.lastName);
    const username = normalizeUsername(request.username);
    const email = normalizeEmail(request.email);
    const phone = normalizeEgyptianPhone(request.phoneNumber);
    const promoCode = request.promoCode?.trim() || null;

    if (!request.firstName?.trim()) {
      fieldErrors.push({ field: 'firstName', code: 'FIELD_REQUIRED' });
    } else if (!isValidName(request.firstName)) {
      fieldErrors.push({ field: 'firstName', code: 'NAME_INVALID' });
    }

    if (!request.lastName?.trim()) {
      fieldErrors.push({ field: 'lastName', code: 'FIELD_REQUIRED' });
    } else if (!isValidName(request.lastName)) {
      fieldErrors.push({ field: 'lastName', code: 'NAME_INVALID' });
    }

    if (!request.username?.trim()) {
      fieldErrors.push({ field: 'username', code: 'FIELD_REQUIRED' });
    } else if (!isValidUsername(request.username)) {
      fieldErrors.push({ field: 'username', code: 'USERNAME_INVALID' });
    }

    if (!request.email?.trim()) {
      fieldErrors.push({ field: 'email', code: 'FIELD_REQUIRED' });
    } else if (!isValidEmail(request.email)) {
      fieldErrors.push({ field: 'email', code: 'EMAIL_INVALID' });
    }

    if (!request.phoneNumber?.trim()) {
      fieldErrors.push({ field: 'phoneNumber', code: 'FIELD_REQUIRED' });
    } else if (!phone) {
      fieldErrors.push({ field: 'phoneNumber', code: 'PHONE_INVALID' });
    }

    if (!request.password) {
      fieldErrors.push({ field: 'password', code: 'FIELD_REQUIRED' });
    } else if (!isValidPassword(request.password)) {
      fieldErrors.push({ field: 'password', code: 'PASSWORD_TOO_WEAK' });
    }

    if (!request.confirmPassword) {
      fieldErrors.push({ field: 'confirmPassword', code: 'FIELD_REQUIRED' });
    } else if (request.password !== request.confirmPassword) {
      fieldErrors.push({ field: 'confirmPassword', code: 'PASSWORD_MISMATCH' });
    }

    if (fieldErrors.length) {
      return this.fail(problem(400, fieldErrors[0]!.code, fieldErrors));
    }

    if (this.state.accounts.some((account) => account.username === username)) {
      fieldErrors.push({ field: 'username', code: 'USERNAME_TAKEN' });
    }
    if (this.state.accounts.some((account) => account.email === email)) {
      fieldErrors.push({ field: 'email', code: 'EMAIL_TAKEN' });
    }
    if (this.state.accounts.some((account) => account.phoneNumber === phone)) {
      fieldErrors.push({ field: 'phoneNumber', code: 'PHONE_TAKEN' });
    }
    if (fieldErrors.length) {
      return this.fail(problem(409, fieldErrors[0]!.code, fieldErrors));
    }

    const createdAt = nowIso();
    const account: MockAccount = {
      id: this.state.nextAccountId++,
      accountType: 'USER',
      status: 'PENDING_VERIFICATION',
      firstName,
      lastName,
      username,
      email,
      phoneNumber: phone,
      password: request.password,
      promoCodeEntered: promoCode,
      createdAt,
      activatedAt: null,
    };

    const rawToken = randomToken();
    const token: MockToken = {
      id: this.state.nextTokenId++,
      userId: account.id,
      rawToken,
      purpose: 'EMAIL_VERIFICATION',
      targetEmail: email,
      expiresAt: Date.now() + TOKEN_TTL_MS,
      consumedAt: null,
      createdAt: Date.now(),
    };

    this.state.accounts.push(account);
    this.state.tokens.push(token);
    this.persist();

    // Mirror production: email send happens after commit and never blocks signup.
    if (typeof window !== 'undefined') {
      (window as unknown as { __orbitLastVerifyToken?: string }).__orbitLastVerifyToken =
        rawToken;
      (window as unknown as { __orbitLastVerifyEmail?: string }).__orbitLastVerifyEmail = email;
    }

    const response: RegisterResponse = {
      id: String(account.id),
      username: account.username,
      email: account.email!,
      status: account.status,
      createdAt: account.createdAt,
    };
    return of(response).pipe(delay(180));
  }

  verify(request: VerifyRequest): Observable<VerifyResponse> {
    const raw = request.token?.trim() ?? '';
    if (!raw) {
      return this.fail(problem(400, 'TOKEN_INVALID'));
    }

    const token = this.state.tokens.find((item) => item.rawToken === raw);
    if (!token) {
      return this.fail(problem(400, 'TOKEN_INVALID'));
    }

    const account = this.state.accounts.find((item) => item.id === token.userId);
    if (!account) {
      return this.fail(problem(400, 'TOKEN_INVALID'));
    }

    if (account.status === 'ACTIVE') {
      return of({
        username: account.username,
        status: 'ACTIVE' as const,
        activatedAt: account.activatedAt ?? nowIso(),
        alreadyVerified: true,
      }).pipe(delay(120));
    }

    if (token.consumedAt !== null) {
      return this.fail(problem(410, 'TOKEN_ALREADY_USED'));
    }

    if (token.expiresAt <= Date.now()) {
      return this.fail(problem(410, 'TOKEN_EXPIRED'));
    }

    const activatedAt = nowIso();
    account.status = 'ACTIVE';
    account.activatedAt = activatedAt;
    token.consumedAt = Date.now();
    this.persist();

    return of({
      username: account.username,
      status: 'ACTIVE' as const,
      activatedAt,
    }).pipe(delay(120));
  }

  resendVerification(request: ResendVerifyRequest): Observable<ResendVerifyResponse> {
    const email = normalizeEmail(request.email ?? '');
    if (!isValidEmail(email)) {
      return this.fail(problem(400, 'EMAIL_INVALID', [{ field: 'email', code: 'EMAIL_INVALID' }]));
    }

    const account = this.state.accounts.find((item) => item.email === email);
    const generic: ResendVerifyResponse = {
      message: 'If that address needs confirming, a new link is on its way.',
      retryAfterSeconds: 120,
    };

    if (!account || account.status === 'ACTIVE') {
      return of(generic).pipe(delay(150));
    }

    const newest = [...this.state.tokens]
      .filter(
        (token) =>
          token.userId === account.id && token.purpose === 'EMAIL_VERIFICATION',
      )
      .sort((a, b) => b.createdAt - a.createdAt)[0];

    if (newest && Date.now() - newest.createdAt < RESEND_COOLDOWN_MS) {
      const retryAfterSeconds = Math.ceil(
        (RESEND_COOLDOWN_MS - (Date.now() - newest.createdAt)) / 1000,
      );
      return this.fail(
        problem(429, 'RATE_LIMITED', [], { retryAfterSeconds }),
      );
    }

    const now = Date.now();
    for (const token of this.state.tokens) {
      if (
        token.userId === account.id &&
        token.purpose === 'EMAIL_VERIFICATION' &&
        token.consumedAt === null
      ) {
        token.consumedAt = now;
      }
    }

    const rawToken = randomToken();
    this.state.tokens.push({
      id: this.state.nextTokenId++,
      userId: account.id,
      rawToken,
      purpose: 'EMAIL_VERIFICATION',
      targetEmail: email,
      expiresAt: now + TOKEN_TTL_MS,
      consumedAt: null,
      createdAt: now,
    });
    this.persist();

    if (typeof window !== 'undefined') {
      (window as unknown as { __orbitLastVerifyToken?: string }).__orbitLastVerifyToken =
        rawToken;
      (window as unknown as { __orbitLastVerifyEmail?: string }).__orbitLastVerifyEmail = email;
    }

    return of(generic).pipe(delay(150));
  }

  requestPasswordReset(
    request: PasswordResetRequest,
  ): Observable<PasswordResetRequestResponse> {
    const email = normalizeEmail(request.email ?? '');
    if (!isValidEmail(email)) {
      return this.fail(problem(400, 'EMAIL_INVALID', [{ field: 'email', code: 'EMAIL_INVALID' }]));
    }

    return of({
      message: 'If an account exists for that address, a reset link is on its way.',
    }).pipe(delay(150));
  }

  confirmPasswordReset(
    request: PasswordResetConfirmRequest,
  ): Observable<PasswordResetConfirmResponse> {
    if (
      !request.token ||
      !request.newPassword ||
      !request.confirmNewPassword
    ) {
      return throwError(
        () =>
          new AuthApiError({
            status: 400,
            code: 'FIELD_REQUIRED',
            title: 'Invalid request',
          }),
      );
    }
  
    if (request.newPassword !== request.confirmNewPassword) {
      return throwError(
        () =>
          new AuthApiError({
            status: 400,
            code: 'PASSWORD_MISMATCH',
            title: 'Passwords do not match',
          }),
      );
    }
  
    return of({
      message: 'Password reset successfully.',
    });
  }

  login(request: LoginRequest): Observable<LoginResponse> {
    if (!request.username?.trim() || !request.password) {
      const fieldErrors: ProblemFieldError[] = [];
      if (!request.username?.trim()) {
        fieldErrors.push({ field: 'username', code: 'FIELD_REQUIRED' });
      }
      if (!request.password) {
        fieldErrors.push({ field: 'password', code: 'FIELD_REQUIRED' });
      }
      return this.fail(problem(400, 'FIELD_REQUIRED', fieldErrors));
    }

    const username = normalizeUsername(request.username);
    const account = this.state.accounts.find((item) => item.username === username);

    // Always compare so timing cannot reveal existence (mock approximates this).
    const passwordMatches = account?.password === request.password;
    if (!account || !passwordMatches) {
      return this.fail(problem(401, 'INVALID_CREDENTIALS'));
    }

    if (account.status === 'PENDING_VERIFICATION') {
      const newest = [...this.state.tokens]
        .filter(
          (token) =>
            token.userId === account.id &&
            token.purpose === 'EMAIL_VERIFICATION' &&
            token.consumedAt === null,
        )
        .sort((a, b) => b.createdAt - a.createdAt)[0];

      if (!newest || newest.expiresAt <= Date.now()) {
        // Auto-resend when the existing link has expired.
        void this.resendVerification({ email: account.email! }).subscribe();
      }

      return this.fail(problem(403, 'ACCOUNT_NOT_VERIFIED'));
    }

    if (account.status === 'SUSPENDED') {
      return this.fail(problem(403, 'ACCOUNT_SUSPENDED'));
    }

    const rememberMe = request.rememberMe === true;
    const response: LoginResponse = {
      accessToken: `mock-access.${account.id}.${Date.now()}`,
      refreshToken: `mock-refresh.${account.id}.${randomToken()}`,
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: String(account.id),
        username: account.username,
        firstName: account.firstName,
        lastName: account.lastName,
        accountType: account.accountType,
      },
    };

    // rememberMe is accepted and stored by the facade; mock returns the same token TTLs.
    void rememberMe;
    return of(response).pipe(delay(150));
  }

  refresh(request: RefreshTokenRequest): Observable<LoginResponse> {
    const token = request.refreshToken?.trim();
    if (!token?.startsWith('mock-refresh.')) {
      return this.fail(problem(401, 'INVALID_REFRESH_TOKEN'));
    }
    const accountId = Number.parseInt(token.split('.')[1] ?? '', 10);
    const account = this.state.accounts.find((item) => item.id === accountId);
    if (!account || account.status !== 'ACTIVE') {
      return this.fail(problem(401, 'INVALID_REFRESH_TOKEN'));
    }
    return of({
      accessToken: `mock-access.${account.id}.${Date.now()}`,
      refreshToken: `mock-refresh.${account.id}.${randomToken()}`,
      tokenType: 'Bearer' as const,
      expiresIn: 900,
      user: {
        id: String(account.id),
        username: account.username,
        firstName: account.firstName,
        lastName: account.lastName,
        accountType: account.accountType,
      },
    }).pipe(delay(150));
  }

  private fail(error: AuthApiError): Observable<never> {
    return throwError(() => error).pipe(delay(80));
  }

  private persist(): void {
    saveState(this.state);
  }

}
