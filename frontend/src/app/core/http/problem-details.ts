import { HttpErrorResponse } from '@angular/common/http';

import { ProblemDetails } from '../../features/auth/data-access/auth.models';

/** Normalised API problem payload extracted from an HTTP error response. */
export type ParsedApiProblem = Pick<
  ProblemDetails,
  | 'type'
  | 'title'
  | 'status'
  | 'code'
  | 'detail'
  | 'instance'
  | 'timestamp'
  | 'traceId'
  | 'fieldErrors'
  | 'retryAfterSeconds'
>;

export function normalizeRequestPath(url: string): string {
  const withoutQuery = url.split('?')[0];
  if (withoutQuery.startsWith('http://') || withoutQuery.startsWith('https://')) {
    try {
      return new URL(withoutQuery).pathname;
    } catch {
      return withoutQuery;
    }
  }
  return withoutQuery;
}

export function problemFromHttpError(error: HttpErrorResponse): ParsedApiProblem {
  const body = error.error as Partial<ProblemDetails> | null;
  const code = body && typeof body === 'object' ? body.code : undefined;
  if (body && typeof body === 'object' && typeof code === 'string') {
    return {
      type: body.type,
      title: body.title,
      status: body.status ?? error.status,
      code,
      detail: body.detail,
      instance: body.instance,
      timestamp: body.timestamp,
      traceId: body.traceId,
      fieldErrors: body.fieldErrors,
      retryAfterSeconds: body.retryAfterSeconds,
    };
  }
  return {
    status: error.status || 0,
    code: error.status === 0 ? 'NETWORK_ERROR' : 'UNKNOWN',
    title: error.statusText || 'Request failed',
  };
}

export function networkProblem(title = 'Network error'): ParsedApiProblem {
  return { status: 0, code: 'NETWORK_ERROR', title };
}
