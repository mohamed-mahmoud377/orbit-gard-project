import {
  LoginResponse,
  RegisterResponse,
  UsernameAvailabilityReason,
  UsernameAvailabilityResponse,
  VerifyResponse,
} from './auth.models';

/** Raw username availability payload from the Spring API (pre-contract). */
export interface BackendUsernameAvailabilityResponse {
  readonly available: boolean;
  readonly username?: string;
  readonly reason?: string | null;
  readonly message?: string | null;
}

export interface BackendRegisterResponse {
  readonly id: string | number;
  readonly username: string;
  readonly email: string;
  readonly status: RegisterResponse['status'];
  readonly createdAt: string;
}

export interface BackendVerifyResponse {
  readonly username: string;
  readonly status: VerifyResponse['status'];
  readonly activatedAt: string;
  readonly alreadyVerified?: boolean;
}

export interface BackendLoginResponse {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly tokenType: 'Bearer';
  readonly expiresIn: number;
  readonly user: {
    readonly id: string | number;
    readonly username: string;
    readonly firstName: string;
    readonly lastName: string;
    readonly accountType: LoginResponse['user']['accountType'];
  };
}

function mapAvailabilityReason(value: string | null | undefined): UsernameAvailabilityReason {
  if (!value) return null;
  if (value === 'TAKEN' || value === 'USERNAME_TAKEN') return 'TAKEN';
  if (value === 'INVALID' || value === 'USERNAME_INVALID') return 'INVALID';
  return null;
}

export function normalizeUsernameAvailability(
  username: string,
  body: BackendUsernameAvailabilityResponse,
): UsernameAvailabilityResponse {
  return {
    username: body.username ?? username,
    available: body.available,
    reason: mapAvailabilityReason(body.reason ?? body.message),
  };
}

export function normalizeRegisterResponse(body: BackendRegisterResponse): RegisterResponse {
  return {
    id: String(body.id),
    username: body.username,
    email: body.email,
    status: body.status,
    createdAt: body.createdAt,
  };
}

export function normalizeVerifyResponse(body: BackendVerifyResponse): VerifyResponse {
  const activatedAtMs = Date.parse(body.activatedAt);
  const alreadyVerified =
    body.alreadyVerified ??
    (body.status === 'ACTIVE' &&
      !Number.isNaN(activatedAtMs) &&
      Date.now() - activatedAtMs > 10_000);

  return {
    username: body.username,
    status: body.status,
    activatedAt: body.activatedAt,
    ...(alreadyVerified ? { alreadyVerified: true } : {}),
  };
}

export function normalizeLoginResponse(body: BackendLoginResponse): LoginResponse {
  return {
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
    tokenType: body.tokenType,
    expiresIn: body.expiresIn,
    user: {
      id: String(body.user.id),
      username: body.user.username,
      firstName: body.user.firstName,
      lastName: body.user.lastName,
      accountType: body.user.accountType,
    },
  };
}
