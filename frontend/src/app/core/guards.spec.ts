import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  convertToParamMap,
  provideRouter,
} from '@angular/router';

import { AuthFacade } from '../features/auth/data-access';
import { guestGuard } from './guards';

/**
 * guestGuard is what stops the browser Back button from looking like a
 * logout. It used to return true unconditionally, so signing in and pressing
 * Back put a password form in front of a user whose session was still
 * perfectly alive.
 */
describe('guestGuard', () => {
  const session = {
    isAuthenticated: signal(false),
    canRefresh: signal(false),
    accountType: signal<string | null>(null),
  };

  function run(returnUrl?: string): boolean | UrlTree {
    const route = {
      queryParamMap: convertToParamMap(returnUrl ? { returnUrl } : {}),
    } as ActivatedRouteSnapshot;

    return TestBed.runInInjectionContext(() =>
      guestGuard(route, {} as RouterStateSnapshot),
    ) as boolean | UrlTree;
  }

  function urlOf(result: boolean | UrlTree): string {
    return TestBed.inject(Router).serializeUrl(result as UrlTree);
  }

  beforeEach(() => {
    session.isAuthenticated.set(false);
    session.canRefresh.set(false);
    session.accountType.set(null);

    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthFacade, useValue: session }],
    });
  });

  it('lets a signed-out visitor reach the auth screens', () => {
    expect(run()).toBe(true);
  });

  it('sends a signed-in parent to the dashboard instead of the login form', () => {
    session.isAuthenticated.set(true);
    session.accountType.set('USER');

    expect(urlOf(run())).toBe('/dashboard');
  });

  it('sends a signed-in child to their own wallet, not the parent dashboard', () => {
    session.isAuthenticated.set(true);
    session.accountType.set('CHILD');

    expect(urlOf(run())).toBe('/my-wallet');
  });

  /**
   * An expired access token with a live refresh token is still a session —
   * the interceptor renews it on the next call. Treating it as signed out
   * here would reopen the exact hole this guard closes, and would disagree
   * with parentGuard and childGuard, which both already count canRefresh.
   */
  it('treats a refreshable session as signed in', () => {
    session.canRefresh.set(true);
    session.accountType.set('USER');

    expect(urlOf(run())).toBe('/dashboard');
  });

  it('honours a returnUrl so an expired-session round trip lands where it started', () => {
    session.isAuthenticated.set(true);
    session.accountType.set('USER');

    expect(urlOf(run('/top-up/instapay/requests'))).toBe('/top-up/instapay/requests');
  });

  /** sanitizeReturnUrl refuses off-site targets — this guard must not become an open redirect. */
  it('ignores an external returnUrl and falls back to the account home', () => {
    session.isAuthenticated.set(true);
    session.accountType.set('USER');

    expect(urlOf(run('https://evil.example.com'))).toBe('/dashboard');
  });
});
