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
    expect(store.canRefresh()).toBe(true);
    expect(store.currentUser()?.username).toBe('mohamed');
    expect(localStorage.getItem('orbit.auth-session.v1')).toContain('access');

    store.clear();
    expect(store.isAuthenticated()).toBe(false);
    expect(store.canRefresh()).toBe(false);
    expect(localStorage.getItem('orbit.auth-session.v1')).toBeNull();
  });

  it('keeps refresh credentials after the access token expires', () => {
    store.hydrateFromLogin(
      {
        accessToken: 'access',
        refreshToken: 'refresh',
        tokenType: 'Bearer',
        expiresIn: -1,
        user: {
          id: '1',
          username: 'mohamed',
          firstName: 'Mohamed',
          lastName: 'Mahmoud',
          accountType: 'USER',
        },
      },
      false,
    );

    expect(store.isAuthenticated()).toBe(false);
    expect(store.canRefresh()).toBe(true);
    expect(store.refreshToken()).toBe('refresh');

    const restored = TestBed.inject(AuthTokenStore);
    expect(restored.canRefresh()).toBe(true);
    expect(restored.isAuthenticated()).toBe(false);
  });
});
