import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, catchError, finalize, map, of, shareReplay, switchMap, take, throwError } from 'rxjs';

import { AuthFacade } from '../../features/auth/data-access/auth.facade';
import { AuthTokenStore } from '../../features/auth/data-access/auth-token.store';

let refreshInFlight: Observable<boolean> | null = null;

function attachBearer(req: Parameters<HttpInterceptorFn>[0], accessToken: string) {
  return req.clone({
    setHeaders: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

function refreshOnce(auth: AuthFacade): Observable<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = auth.refreshSession().pipe(
      map(() => true),
      catchError((error) => throwError(() => error)),
      finalize(() => {
        refreshInFlight = null;
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
  }
  return refreshInFlight.pipe(take(1));
}

/** Attaches the access token and transparently refreshes once on 401. */
export const authBearerInterceptor: HttpInterceptorFn = (req, next) => {
  const tokens = inject(AuthTokenStore);
  const auth = inject(AuthFacade);

  if (req.headers.has('Authorization') || req.url.includes('/auth/')) {
    return next(req);
  }

  const send = (accessToken: string | null) => {
    const authorized = accessToken ? attachBearer(req, accessToken) : req;
    return next(authorized).pipe(
      catchError((error: unknown) => {
        if (
          error instanceof HttpErrorResponse &&
          error.status === 401 &&
          !req.url.includes('/auth/') &&
          tokens.canRefresh() &&
          !req.headers.has('X-Orbit-Retry')
        ) {
          return refreshOnce(auth).pipe(
            switchMap(() => {
              const renewed = tokens.accessToken();
              if (!renewed) {
                return throwError(() => error);
              }
              return next(
                attachBearer(req, renewed).clone({
                  setHeaders: { 'X-Orbit-Retry': '1' },
                }),
              );
            }),
            catchError(() => throwError(() => error)),
          );
        }
        return throwError(() => error);
      }),
    );
  };

  const accessToken = tokens.accessToken();
  if (accessToken && tokens.isAccessTokenValid()) {
    return send(accessToken);
  }

  if (tokens.canRefresh()) {
    return refreshOnce(auth).pipe(
      switchMap(() => send(tokens.accessToken())),
      catchError(() => send(null)),
    );
  }

  return send(null);
};
