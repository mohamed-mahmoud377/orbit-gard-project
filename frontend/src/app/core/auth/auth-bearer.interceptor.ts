import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, map, of, shareReplay, switchMap, take, throwError } from 'rxjs';

import { AuthFacade } from '../../features/auth/data-access/auth.facade';
import { AuthTokenStore } from '../../features/auth/data-access/auth-token.store';
import { loginUrlWithReturn } from '../navigation/return-url';

let refreshInFlight: Observable<boolean> | null = null;

/** @internal Test helper — clears the in-flight refresh queue between specs. */
export function resetAuthBearerRefreshStateForTests(): void {
  refreshInFlight = null;
}

function attachBearer(req: Parameters<HttpInterceptorFn>[0], accessToken: string) {
  return req.clone({
    setHeaders: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

/** Clears the session and sends the user back to login, preserving where they were. */
function forceReauth(auth: AuthFacade, router: Router): void {
  auth.logoutLocal();
  void router.navigateByUrl(loginUrlWithReturn(router.url));
}

function refreshOnce(auth: AuthFacade, router: Router): Observable<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = auth.refreshSession().pipe(
      map(() => true),
      catchError((error) => {
        // Refresh token is invalid/expired (or missing) — the session can't be
        // salvaged, so clear it and send the user back to login.
        forceReauth(auth, router);
        return throwError(() => error);
      }),
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
  const router = inject(Router);

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
          !req.headers.has('X-Orbit-Retry')
        ) {
          if (!tokens.canRefresh()) {
            // No refresh token to try — session is over, don't wait for another 401.
            forceReauth(auth, router);
            return throwError(() => error);
          }

          return refreshOnce(auth, router).pipe(
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
    return refreshOnce(auth, router).pipe(
      switchMap(() => send(tokens.accessToken())),
      catchError((error) => throwError(() => error)),
    );
  }

  return send(null);
};