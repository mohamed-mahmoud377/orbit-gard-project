import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { HttpAuthGateway } from './http-auth.gateway';
import { AuthApiError } from './auth.models';

describe('HttpAuthGateway', () => {
  let gateway: HttpAuthGateway;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), HttpAuthGateway],
    });
    gateway = TestBed.inject(HttpAuthGateway);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('checks username availability from contract-shaped payloads', () => {
    gateway.checkUsername('omar.hassan').subscribe((response) => {
      expect(response).toEqual({
        username: 'omar.hassan',
        available: true,
        reason: null,
      });
    });
    const req = http.expectOne('/api/v1/auth/username-available?username=omar.hassan');
    expect(req.request.method).toBe('GET');
    req.flush({ username: 'omar.hassan', available: true, reason: null });
  });

  it('normalizes backend username availability payloads', () => {
    gateway.checkUsername('taken.user').subscribe((response) => {
      expect(response).toEqual({
        username: 'taken.user',
        available: false,
        reason: 'TAKEN',
      });
    });
    const req = http.expectOne('/api/v1/auth/username-available?username=taken.user');
    req.flush({ available: false, message: 'USERNAME_TAKEN' });
  });

  it('posts register payloads and normalizes UUID ids', () => {
    const body = {
      firstName: 'Omar',
      lastName: 'Hassan',
      username: 'omar.hassan',
      email: 'omar@example.com',
      phoneNumber: '01012345678',
      password: 'Passw0rd!',
      confirmPassword: 'Passw0rd!',
    };
    gateway.register(body).subscribe((response) => {
      expect(response.status).toBe('PENDING_VERIFICATION');
      expect(response.id).toBe('82fb922f-1c0f-443d-9e02-245bb87d6139');
    });
    const req = http.expectOne('/api/v1/auth/register');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush({
      id: '82fb922f-1c0f-443d-9e02-245bb87d6139',
      username: 'omar.hassan',
      email: 'omar@example.com',
      status: 'PENDING_VERIFICATION',
      createdAt: '2026-07-26T18:40:11Z',
    });
  });

  it('maps problem+json errors', () => {
    gateway.login({ username: 'mohamed', password: 'bad' }).subscribe({
      next: () => {
        throw new Error('expected error');
      },
      error: (error: unknown) => {
        expect(error).toBeInstanceOf(AuthApiError);
        expect((error as AuthApiError).code).toBe('INVALID_CREDENTIALS');
        expect((error as AuthApiError).status).toBe(401);
      },
    });
    const req = http.expectOne('/api/v1/auth/login');
    req.flush(
      {
        type: 'https://orbit.local/errors/invalid-credentials',
        title: 'Invalid credentials',
        status: 401,
        code: 'INVALID_CREDENTIALS',
        detail: 'developer only',
      },
      { status: 401, statusText: 'Unauthorized' },
    );
  });

  it('normalizes login user ids to strings', () => {
    gateway.login({ username: 'omar.hassan', password: 'Passw0rd!' }).subscribe((response) => {
      expect(response.user.id).toBe('82fb922f-1c0f-443d-9e02-245bb87d6139');
    });
    const req = http.expectOne('/api/v1/auth/login');
    req.flush({
      accessToken: 'access',
      refreshToken: 'refresh',
      tokenType: 'Bearer',
      expiresIn: 300,
      user: {
        id: '82fb922f-1c0f-443d-9e02-245bb87d6139',
        username: 'omar.hassan',
        firstName: 'Omar',
        lastName: 'Hassan',
        accountType: 'USER',
      },
    });
  });

  it('posts refresh payloads and normalizes the login-shaped response', () => {
    gateway.refresh({ refreshToken: 'stale-refresh' }).subscribe((response) => {
      expect(response.accessToken).toBe('new-access');
      expect(response.refreshToken).toBe('new-refresh');
      expect(response.user.id).toBe('82fb922f-1c0f-443d-9e02-245bb87d6139');
    });
    const req = http.expectOne('/api/v1/auth/refresh');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ refreshToken: 'stale-refresh' });
    req.flush({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: '82fb922f-1c0f-443d-9e02-245bb87d6139',
        username: 'omar.hassan',
        firstName: 'Omar',
        lastName: 'Hassan',
        accountType: 'USER',
      },
    });
  });

  it('posts password reset request and confirm endpoints', () => {
    gateway.requestPasswordReset({ email: 'omar@example.com' }).subscribe((response) => {
      expect(response.message).toContain('reset link');
    });
    const request = http.expectOne('/api/v1/password/reset/request');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ email: 'omar@example.com' });
    request.flush({
      message: 'If an account exists for that address, a reset link is on its way.',
    });

    gateway
      .confirmPasswordReset({
        token: 'reset-token',
        newPassword: 'NewPass1',
        confirmNewPassword: 'NewPass1',
      })
      .subscribe((response) => {
        expect(response.message).toContain('password');
      });
    const confirm = http.expectOne('/api/v1/password/reset/confirm');
    expect(confirm.request.method).toBe('POST');
    confirm.flush({
      message: 'Your password is updated. You can now sign in with your new password.',
    });
  });

  it('posts logout to revoke the current server session', () => {
    gateway.logout().subscribe((result) => {
      expect(result).toBeUndefined();
    });
    const req = http.expectOne('/api/v1/auth/logout');
    expect(req.request.method).toBe('POST');
    req.flush(null);
  });

  it('posts verify and resend endpoints', () => {
    gateway.verify({ token: 'abc' }).subscribe((response) => {
      expect(response.status).toBe('ACTIVE');
      expect(response.alreadyVerified).toBeUndefined();
    });
    http.expectOne('/api/v1/auth/verify').flush({
      username: 'omar.hassan',
      status: 'ACTIVE',
      activatedAt: new Date().toISOString(),
    });

    gateway.resendVerification({ email: 'omar@example.com' }).subscribe();
    const resend = http.expectOne('/api/v1/auth/verify/resend');
    expect(resend.request.method).toBe('POST');
    resend.flush({
      message: 'If that address needs confirming, a new link is on its way.',
      retryAfterSeconds: 120,
    });
  });
});
