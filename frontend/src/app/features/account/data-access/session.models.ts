export interface SessionSummary {
  readonly id: string;
  readonly deviceLabel: string;
  readonly location: string | null;
  readonly lastUsedAt: string;
  readonly currentDevice: boolean;
}

export type SessionErrorCode =
  | 'CANNOT_SIGN_OUT_CURRENT_DEVICE'
  | 'SESSION_NOT_FOUND'
  | 'UNAUTHENTICATED'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

const API_CODE_TO_ERROR: Record<string, SessionErrorCode> = {
  'cannot-sign-out-current-device': 'CANNOT_SIGN_OUT_CURRENT_DEVICE',
  'resource-not-found': 'SESSION_NOT_FOUND',
  unauthenticated: 'UNAUTHENTICATED',
};

export function normalizeSessionErrorCode(apiCode: string): SessionErrorCode {
  const trimmed = apiCode.trim();
  const mapped = API_CODE_TO_ERROR[trimmed.toLowerCase()];
  if (mapped) {
    return mapped;
  }

  const screamingSnake = trimmed.toUpperCase().replace(/-/g, '_');
  const knownCodes: SessionErrorCode[] = [
    'CANNOT_SIGN_OUT_CURRENT_DEVICE',
    'SESSION_NOT_FOUND',
    'UNAUTHENTICATED',
    'NETWORK_ERROR',
    'UNKNOWN',
  ];
  if (knownCodes.includes(screamingSnake as SessionErrorCode)) {
    return screamingSnake as SessionErrorCode;
  }

  return 'UNKNOWN';
}

export class SessionApiError extends Error {
  readonly status: number;
  readonly code: SessionErrorCode;
  readonly detail?: string;

  constructor(problem: { status: number; code: string; title?: string; detail?: string }) {
    super(problem.title ?? problem.code);
    this.name = 'SessionApiError';
    this.status = problem.status;
    this.code = normalizeSessionErrorCode(problem.code);
    this.detail = problem.detail;
  }
}
