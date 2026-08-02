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

  it('checks username availability', () => {
    gateway.checkUsername('omar.hassan').subscribe((response) => {
      expect(response.available).toBe(true);
    });
    const req = http.expectOne('/api/v1/auth/username-available?username=omar.hassan');
    expect(req.request.method).toBe('GET');
    req.flush({ username: 'omar.hassan', available: true, reason: null });
  });

  it('posts register payloads', () => {
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
    });
    const req = http.expectOne('/api/v1/auth/register');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush({
      id: 42,
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

  it('posts verify and resend endpoints', () => {
    gateway.verify({ token: 'abc' }).subscribe();
    http.expectOne('/api/v1/auth/verify').flush({
      username: 'omar.hassan',
      status: 'ACTIVE',
      activatedAt: '2026-07-26T19:02:44Z',
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
