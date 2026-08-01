import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { AuthTokenStore } from '../../features/auth/data-access/auth-token.store';

/** Attaches the access token. Refresh/rotation is intentionally not implemented yet. */
export const authBearerInterceptor: HttpInterceptorFn = (req, next) => {
  const tokens = inject(AuthTokenStore);
  const accessToken = tokens.accessToken();

  if (!accessToken || req.headers.has('Authorization')) {
    return next(req);
  }

  // Auth endpoints themselves do not require a bearer token.
  if (req.url.includes('/auth/')) {
    return next(req);
  }

  return next(
    req.clone({
      setHeaders: {
        Authorization: `Bearer ${accessToken}`,
      },
    }),
  );
};
