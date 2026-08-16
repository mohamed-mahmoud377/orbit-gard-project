import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { TokenStore } from './token-store';

/**
 * Gate for `/checkout`, `/orders`, `/account`, `/wishlist`.
 *
 * We check the raw token rather than `AuthService.user()` so a hard refresh
 * straight onto a protected URL isn't bounced to /login while `/auth/me` is
 * still in flight; an invalid token is caught by the 401 from the API.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const router = inject(Router);
  if (inject(TokenStore).token()) return true;
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
