import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, map, switchMap, throwError } from 'rxjs';

import { normalizeRequestPath } from '../http/problem-details';
import { AuthFacade } from '../../features/auth/data-access/auth.facade';
import { AuthTokenStore } from '../../features/auth/data-access/auth-token.store';
import { loginUrlWithReturn } from '../navigation/return-url';

/** Unauthenticated auth/password endpoints — matched by exact path suffix. */
const PUBLIC_API_PATH_SUFFIXES = [
  '/auth/login',
  '/auth/register',
  '/auth/verify',
  '/auth/verify/resend',
  '/auth/refresh',
  '/auth/username-available',
  '/auth/promo-code',
  '/password/reset/request',
  '/password/reset/confirm',
] as const;

function isPublicAuthRequest(url: string): boolean {
  const path = normalizeRequestPath(url);
  return PUBLIC_API_PATH_SUFFIXES.some((suffix) => path.endsWith(suffix));
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

function refreshOnce(auth: AuthFacade, router: Router) {
  return auth.refreshSessionOnce().pipe(
    map(() => true),
    catchError((error) => {
      // Refresh token is invalid/expired (or missing) — the session can't be
      // salvaged, so clear it and send the user back to login.
      forceReauth(auth, router);
      return throwError(() => error);
    }),
  );
}

/** Attaches the access token and transparently refreshes once on 401. */
export const authBearerInterceptor: HttpInterceptorFn = (req, next) => {
  const tokens = inject(AuthTokenStore);
  const auth = inject(AuthFacade);
  const router = inject(Router);

  if (req.headers.has('Authorization') || isPublicAuthRequest(req.url)) {
    return next(req);
  }

  const send = (accessToken: string | null) => {
    const authorized = accessToken ? attachBearer(req, accessToken) : req;
    return next(authorized).pipe(
      catchError((error: unknown) => {
        if (
          error instanceof HttpErrorResponse &&
          error.status === 401 &&
          !isPublicAuthRequest(req.url) &&
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
