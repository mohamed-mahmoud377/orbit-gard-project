import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { DemoStore } from '../data-access';

export const authenticatedGuard: CanActivateFn = () => {
  const store = inject(DemoStore);
  const router = inject(Router);
  return store.isAuthenticated() ? true : router.createUrlTree(['/auth/login']);
};

export const parentGuard: CanActivateFn = () => {
  const store = inject(DemoStore);
  const router = inject(Router);
  if (!store.isAuthenticated()) return router.createUrlTree(['/auth/login']);
  return store.currentUser()?.role === 'parent' ? true : router.createUrlTree(['/my-wallet']);
};

export const childGuard: CanActivateFn = () => {
  const store = inject(DemoStore);
  const router = inject(Router);
  if (!store.isAuthenticated()) return router.createUrlTree(['/auth/login']);
  return store.currentUser()?.role === 'child' ? true : router.createUrlTree(['/dashboard']);
};

/** Auth screens are always reachable so the app can open on login. */
export const guestGuard: CanActivateFn = () => true;
