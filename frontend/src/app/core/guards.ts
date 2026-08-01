import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthFacade } from '../features/auth/data-access';

export const authenticatedGuard: CanActivateFn = () => {
  const auth = inject(AuthFacade);
  const router = inject(Router);
  return auth.isAuthenticated() ? true : router.createUrlTree(['/auth/login']);
};

export const parentGuard: CanActivateFn = () => {
  const auth = inject(AuthFacade);
  const router = inject(Router);
  if (!auth.isAuthenticated()) return router.createUrlTree(['/auth/login']);
  return auth.accountType() === 'USER' ? true : router.createUrlTree(['/my-wallet']);
};

export const childGuard: CanActivateFn = () => {
  const auth = inject(AuthFacade);
  const router = inject(Router);
  if (!auth.isAuthenticated()) return router.createUrlTree(['/auth/login']);
  return auth.accountType() === 'CHILD' ? true : router.createUrlTree(['/dashboard']);
};

/** Auth screens are always reachable so the app can open on login. */
export const guestGuard: CanActivateFn = () => true;
