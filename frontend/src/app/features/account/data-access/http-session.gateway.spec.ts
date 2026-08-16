import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { HttpSessionGateway } from './http-session.gateway';

describe('HttpSessionGateway', () => {
  let gateway: HttpSessionGateway;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), HttpSessionGateway],
    });
    gateway = TestBed.inject(HttpSessionGateway);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('loads active sessions', () => {
    gateway.listActiveSessions().subscribe((sessions) => {
      expect(sessions).toEqual([
        {
          id: 'session-1',
          deviceLabel: 'MacBook Pro · Chrome 141',
          location: 'Cairo, Egypt · 41.35.28.114',
          lastUsedAt: '2026-07-25T10:00:00Z',
          currentDevice: true,
        },
      ]);
    });

    const req = http.expectOne('/api/v1/sessions');
    expect(req.request.method).toBe('GET');
    req.flush([
      {
        id: 'session-1',
        deviceLabel: 'MacBook Pro · Chrome 141',
        location: 'Cairo, Egypt · 41.35.28.114',
        lastUsedAt: '2026-07-25T10:00:00Z',
        currentDevice: true,
      },
    ]);
  });

  it('signs out a single session', () => {
    gateway.signOutSession('session-2').subscribe((result) => {
      expect(result).toBeNull();
    });

    const req = http.expectOne('/api/v1/sessions/session-2');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('signs out all other sessions', () => {
    gateway.signOutAllOthers().subscribe((result) => {
      expect(result).toBeNull();
    });

    const req = http.expectOne('/api/v1/sessions/sign-out-others');
    expect(req.request.method).toBe('POST');
    req.flush(null);
  });
});
