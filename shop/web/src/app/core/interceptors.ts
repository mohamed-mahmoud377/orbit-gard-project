import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ApiError } from './api-error';
import { ApiErrorDetails } from './models';
import { TokenStore } from './token-store';

/** Attach the shop session JWT to same-origin API calls. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(TokenStore).token();
  if (!token || !req.url.startsWith('/shop/api')) return next(req);
  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};

interface ErrorEnvelope {
  error?: { code?: string; message?: string; details?: ApiErrorDetails };
}

/**
 * Unwrap the CONTRACT §5 envelope into an `ApiError` so every consumer sees a
 * `code` + a user-safe `message` instead of an `HttpErrorResponse`.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse)) return throwError(() => err);

      // status 0 means the request never got an answer — DNS, offline, CORS.
      if (err.status === 0) {
        return throwError(
          () =>
            new ApiError(
              0,
              'NETWORK_ERROR',
              "We couldn't reach the store. Check your connection and try again.",
            ),
        );
      }

      const body = err.error as ErrorEnvelope | string | null;
      const envelope = typeof body === 'object' && body !== null ? body.error : undefined;

      return throwError(
        () =>
          new ApiError(
            err.status,
            envelope?.code ?? 'UNEXPECTED_ERROR',
            envelope?.message ?? 'Something went wrong. Please try again.',
            envelope?.details,
          ),
      );
    }),
  );
