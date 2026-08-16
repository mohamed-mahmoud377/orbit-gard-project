import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { AuthFacade, resetAuthRefreshStateForTests } from '../../features/auth/data-access/auth.facade';
import { AuthTokenStore } from '../../features/auth/data-access/auth-token.store';
import { LoginResponse } from '../../features/auth/data-access/auth.models';
import { authBearerInterceptor } from './auth-bearer.interceptor';

describe('authBearerInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let tokens: AuthTokenStore;
  let auth: {
    refreshSessionOnce: ReturnType<typeof vi.fn>;
    logoutLocal: ReturnType<typeof vi.fn>;
  };
  let router: { url: string; navigateByUrl: ReturnType<typeof vi.fn> };

  const refreshedSession = (accessToken: string, refreshToken: string): LoginResponse => ({
    accessToken,
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: 900,
    user: {
      id: '1',
      username: 'mohamed',
      firstName: 'Mohamed',
      lastName: 'Mahmoud',
      accountType: 'USER',
    },
  });

  beforeEach(() => {
    resetAuthRefreshStateForTests();
    localStorage.clear();

    auth = {
      refreshSessionOnce: vi.fn(),
      logoutLocal: vi.fn(),
    };
    router = {
      url: '/dashboard',
      navigateByUrl: vi.fn().mockResolvedValue(true),
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authBearerInterceptor])),
        provideHttpClientTesting(),
        AuthTokenStore,
        { provide: AuthFacade, useValue: auth },
        { provide: Router, useValue: router },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    tokens = TestBed.inject(AuthTokenStore);
  });

  afterEach(() => {
    httpMock.verify();
    resetAuthRefreshStateForTests();
    localStorage.clear();
  });

  function seedSession(expiresInSeconds: number): void {
    tokens.hydrateFromLogin(
      {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        tokenType: 'Bearer',
        expiresIn: expiresInSeconds,
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
  }

  function mockRefreshSuccess(accessToken: string, refreshToken: string): void {
    const response = refreshedSession(accessToken, refreshToken);
    auth.refreshSessionOnce.mockImplementation(() => {
      tokens.hydrateFromLogin(response);
      return of(response);
    });
  }

  it('attaches the bearer token to protected requests', () => {
    seedSession(900);

    http.get('/api/v1/wallet').subscribe();
    const req = httpMock.expectOne('/api/v1/wallet');
    expect(req.request.headers.get('Authorization')).toBe('Bearer access-token');
    req.flush({});
  });

  it('refreshes proactively when the access token is expired', () => {
    seedSession(-1);
    mockRefreshSuccess('renewed-access', 'renewed-refresh');

    http.get('/api/v1/wallet').subscribe();
    expect(auth.refreshSessionOnce).toHaveBeenCalledTimes(1);

    const req = httpMock.expectOne('/api/v1/wallet');
    expect(req.request.headers.get('Authorization')).toBe('Bearer renewed-access');
    req.flush({});
  });

  it('logs out and redirects when proactive refresh fails', () => {
    seedSession(-1);
    auth.refreshSessionOnce.mockReturnValue(throwError(() => new Error('refresh failed')));

    http.get('/api/v1/wallet').subscribe({
      error: () => undefined,
    });

    expect(auth.refreshSessionOnce).toHaveBeenCalledTimes(1);
    expect(auth.logoutLocal).toHaveBeenCalledTimes(1);
    expect(router.navigateByUrl).toHaveBeenCalledWith(
      '/auth/login?returnUrl=%2Fdashboard',
    );
    httpMock.expectNone('/api/v1/wallet');
  });

  it('attaches the bearer token to logout requests', () => {
    seedSession(900);

    http.post('/api/v1/auth/logout', null).subscribe();
    const req = httpMock.expectOne('/api/v1/auth/logout');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Authorization')).toBe('Bearer access-token');
    req.flush(null);
  });

  it('retries once after a 401 when refresh succeeds', () => {
    seedSession(900);
    mockRefreshSuccess('retry-access', 'retry-refresh');

    http.get('/api/v1/wallet').subscribe();
    const first = httpMock.expectOne('/api/v1/wallet');
    first.flush({}, { status: 401, statusText: 'Unauthorized' });

    const retry = httpMock.expectOne('/api/v1/wallet');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer retry-access');
    expect(retry.request.headers.get('X-Orbit-Retry')).toBe('1');
    retry.flush({});
  });

  it('does not attach bearer or refresh for password reset request', () => {
    seedSession(-1);

    http.post('/api/v1/password/reset/request', { email: 'user@example.com' }).subscribe();
    expect(auth.refreshSessionOnce).not.toHaveBeenCalled();

    const req = httpMock.expectOne('/api/v1/password/reset/request');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({ message: 'If an account exists, a reset link is on its way.' });
  });

  it('does not attach bearer or refresh for password reset confirm', () => {
    seedSession(-1);

    http
      .post('/api/v1/password/reset/confirm', {
        token: 'reset-token',
        newPassword: 'Passw0rd1',
        confirmNewPassword: 'Passw0rd1',
      })
      .subscribe();
    expect(auth.refreshSessionOnce).not.toHaveBeenCalled();

    const req = httpMock.expectOne('/api/v1/password/reset/confirm');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({ message: 'Password reset' });
  });
});
