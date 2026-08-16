import { ApiErrorDetails } from './models';

/**
 * The unwrapped `{ error: { code, message, details } }` envelope from
 * CONTRACT §5. `message` is written to be shown to the user verbatim.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: ApiErrorDetails;

  constructor(status: number, code: string, message: string, details?: ApiErrorDetails) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Field-level messages for form binding, e.g. `cardNumber`. */
  get fieldErrors(): Record<string, string> {
    return this.details?.fieldErrors ?? {};
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}
