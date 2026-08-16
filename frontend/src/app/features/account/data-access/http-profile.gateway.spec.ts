import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { HttpProfileGateway } from './http-profile.gateway';

describe('HttpProfileGateway', () => {
  let gateway: HttpProfileGateway;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), HttpProfileGateway],
    });
    gateway = TestBed.inject(HttpProfileGateway);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('loads profile including email and session count', () => {
    gateway.getProfile().subscribe((profile) => {
      expect(profile).toEqual({
        firstName: 'Omar',
        lastName: 'Hassan',
        username: 'omar.hassan',
        email: 'omar@example.com',
        phoneNumber: '+201012345678',
        nonRevokedSessionCount: 2,
      });
    });

    const req = http.expectOne('/api/v1/profile');
    expect(req.request.method).toBe('GET');
    req.flush({
      firstName: 'Omar',
      lastName: 'Hassan',
      username: 'omar.hassan',
      email: 'omar@example.com',
      phoneNumber: '+201012345678',
      nonRevokedSessionCount: 2,
    });
  });

  it('updates profile and normalizes the response', () => {
    const payload = {
      firstName: 'Omar',
      lastName: 'Hassan',
      username: 'omar.hassan',
      phoneNumber: '+201098765432',
    };

    gateway.updateProfile(payload).subscribe((profile) => {
      expect(profile.email).toBe('omar@example.com');
      expect(profile.phoneNumber).toBe('+201098765432');
    });

    const req = http.expectOne('/api/v1/profile');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(payload);
    req.flush({
      firstName: 'Omar',
      lastName: 'Hassan',
      username: 'omar.hassan',
      email: 'omar@example.com',
      phoneNumber: '+201098765432',
    });
  });
});
