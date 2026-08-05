import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthFacade } from '../features/auth/data-access';
import { loginUrlWithReturn } from './navigation/return-url';

function redirectToLogin(stateUrl: string) {
  const router = inject(Router);
  return router.parseUrl(loginUrlWithReturn(stateUrl));
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

/** Auth screens are always reachable so the app can open on login. */
export const guestGuard: CanActivateFn = () => true;
