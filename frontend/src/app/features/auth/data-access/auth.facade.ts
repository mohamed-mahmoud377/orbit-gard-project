import { Injectable, inject } from '@angular/core';
import { Observable, tap, throwError } from 'rxjs';

import { DemoStore } from '../../../data-access';
import { AUTH_GATEWAY } from './auth.gateway';
import { AuthTokenStore } from './auth-token.store';
import {
  LoginRequest,
  LoginResponse,
  PromoCodeValidationResponse,
  RefreshTokenRequest,
  RegisterRequest,
  RegisterResponse,
  ResendVerifyRequest,
  ResendVerifyResponse,
  UsernameAvailabilityResponse,
  VerifyRequest,
  VerifyResponse,
} from './auth.models';

@Injectable({ providedIn: 'root' })
export class AuthFacade {
  private readonly gateway = inject(AUTH_GATEWAY);
  private readonly tokens = inject(AuthTokenStore);
  private readonly demoStore = inject(DemoStore);

  readonly currentUser = this.tokens.currentUser;
  readonly isAuthenticated = this.tokens.isAuthenticated;
  readonly canRefresh = this.tokens.canRefresh;
  readonly accountType = this.tokens.accountType;
  readonly accessToken = this.tokens.accessToken;

  constructor() {
    const user = this.tokens.currentUser();
    if (user && (this.tokens.isAuthenticated() || this.tokens.canRefresh())) {
      this.demoStore.adoptAuthenticatedUser({
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        accountType: user.accountType,
      });
    }
  }

  checkUsername(username: string): Observable<UsernameAvailabilityResponse> {
    return this.gateway.checkUsername(username);
  }

  validatePromoCode(code: string): Observable<PromoCodeValidationResponse> {
    return this.gateway.validatePromoCode(code);
  }

  register(request: RegisterRequest): Observable<RegisterResponse> {
    return this.gateway.register(request);
  }

  verify(request: VerifyRequest): Observable<VerifyResponse> {
    return this.gateway.verify(request);
  }

  resendVerification(request: ResendVerifyRequest): Observable<ResendVerifyResponse> {
    return this.gateway.resendVerification(request);
  }

  login(request: LoginRequest): Observable<LoginResponse> {
    return this.gateway.login(request).pipe(
      tap((response) => {
        this.tokens.hydrateFromLogin(response, request.rememberMe === true);
        this.demoStore.adoptAuthenticatedUser({
          username: response.user.username,
          firstName: response.user.firstName,
          lastName: response.user.lastName,
          accountType: response.user.accountType,
        });
      }),
    );
  }

  refreshSession(): Observable<LoginResponse> {
    const refreshToken = this.tokens.refreshToken();
    if (!refreshToken) {
      return throwError(() => new Error('No refresh token available'));
    }
    return this.refreshWithToken({ refreshToken });
  }

  refreshWithToken(request: RefreshTokenRequest): Observable<LoginResponse> {
    return this.gateway.refresh(request).pipe(
      tap((response) => {
        this.tokens.hydrateFromLogin(response);
      }),
    );
  }

  /** Local sign-out only — server logout is outside the five-endpoint baseline. */
  logoutLocal(): void {
    this.tokens.clear();
    this.demoStore.logout();
  }
}
