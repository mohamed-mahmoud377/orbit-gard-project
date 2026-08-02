import { TestBed } from '@angular/core/testing';

import { AuthTokenStore } from './auth-token.store';

describe('AuthTokenStore', () => {
  let store: AuthTokenStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    store = TestBed.inject(AuthTokenStore);
  });

  it('persists and restores a login session', () => {
    store.hydrateFromLogin(
      {
        accessToken: 'access',
        refreshToken: 'refresh',
        tokenType: 'Bearer',
        expiresIn: 900,
        user: {
          id: '1',
          username: 'mohamed',
          firstName: 'Mohamed',
          lastName: 'Mahmoud',
          accountType: 'USER',
        },
      },
      true,
    );

    expect(store.isAuthenticated()).toBe(true);
    expect(store.currentUser()?.username).toBe('mohamed');
    expect(localStorage.getItem('orbit.auth-session.v1')).toContain('access');

    store.clear();
    expect(store.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('orbit.auth-session.v1')).toBeNull();
  });
});
