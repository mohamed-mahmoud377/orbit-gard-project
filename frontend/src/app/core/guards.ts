import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthFacade } from '../features/auth/data-access';
import { loginUrlWithReturn, sanitizeReturnUrl } from './navigation/return-url';

function redirectToLogin(stateUrl: string) {
  const router = inject(Router);
  return router.parseUrl(loginUrlWithReturn(stateUrl));
}

/**
 * Where a signed-in account belongs. The two layouts have separate homes, and
 * sending a child to /dashboard would only bounce off parentGuard.
 */
function homeUrlFor(accountType: string | null): string {
  return accountType === 'CHILD' ? '/my-wallet' : '/dashboard';
}

export const authenticatedGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthFacade);
  if (auth.isAuthenticated() || auth.canRefresh()) return true;
  return redirectToLogin(state.url);
};

export const parentGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthFacade);
  const router = inject(Router);
  if (!auth.isAuthenticated() && !auth.canRefresh()) {
    return redirectToLogin(state.url);
  }
  return auth.accountType() === 'USER' ? true : router.createUrlTree(['/my-wallet']);
};

export const childGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthFacade);
  const router = inject(Router);
  if (!auth.isAuthenticated() && !auth.canRefresh()) {
    return redirectToLogin(state.url);
  }
  return auth.accountType() === 'CHILD' ? true : router.createUrlTree(['/dashboard']);
};

/**
 * Auth screens are for guests only.
 *
 * This used to return true unconditionally, which made signing in feel
 * reversible: the browser Back button from /dashboard landed on the login
 * form, and a form asking for your password reads as "you have been signed
 * out" even though nothing had cleared the session. Nothing had — the login
 * page does not touch the token store on load — so the tokens were still
 * there the whole time. It only looked like a logout, which is arguably
 * worse than being one, because the fix a user reaches for is typing their
 * password again.
 *
 * `canRefresh()` counts as signed in, matching parentGuard and childGuard: an
 * expired access token with a live refresh token is a session, and the
 * interceptor renews it on the next call. If a refresh genuinely fails the
 * store is cleared, and this guard opens again on its own.
 *
 * A returnUrl is honoured when present so an expired-session round trip lands
 * back where it started rather than always on the dashboard.
 */
export const guestGuard: CanActivateFn = (route) => {
  const auth = inject(AuthFacade);
  const router = inject(Router);

  if (!auth.isAuthenticated() && !auth.canRefresh()) {
    return true;
  }

  const returnUrl = sanitizeReturnUrl(route.queryParamMap.get('returnUrl'));
  return router.parseUrl(returnUrl ?? homeUrlFor(auth.accountType()));
};
