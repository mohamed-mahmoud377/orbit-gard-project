import { Injectable, inject } from '@angular/core';
import { Observable, catchError, finalize, of, shareReplay, take, tap, throwError } from 'rxjs';

import { DemoStore } from '../../../data-access';
import { AUTH_GATEWAY } from './auth.gateway';
import { AuthTokenStore } from './auth-token.store';
import {
  LoginRequest,
  LoginResponse,
  PromoCodeValidationResponse,
  PasswordResetRequest,
  PasswordResetRequestResponse,
  PasswordResetConfirmRequest,
  PasswordResetConfirmResponse,
  RefreshTokenRequest,
  RegisterRequest,
  RegisterResponse,
  ResendVerifyRequest,
  ResendVerifyResponse,
  UsernameAvailabilityResponse,
  VerifyRequest,
  VerifyResponse,
} from './auth.models';

let refreshInFlight: Observable<LoginResponse> | null = null;

/** @internal Clears the shared refresh queue between specs. */
export function resetAuthRefreshStateForTests(): void {
  refreshInFlight = null;
}

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

  requestPasswordReset(request: PasswordResetRequest): Observable<PasswordResetRequestResponse> {
    return this.gateway.requestPasswordReset(request);
  }

  confirmPasswordReset(
    request: PasswordResetConfirmRequest,
  ): Observable<PasswordResetConfirmResponse> {
    return this.gateway.confirmPasswordReset(request);
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

  /**
   * Queues concurrent refresh attempts so only one POST /auth/refresh runs.
   * Required when the backend rotates refresh tokens on each call.
   */
  refreshSessionOnce(): Observable<LoginResponse> {
    if (!refreshInFlight) {
      refreshInFlight = this.refreshSession().pipe(
        finalize(() => {
          refreshInFlight = null;
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return refreshInFlight.pipe(take(1));
  }

  refreshWithToken(request: RefreshTokenRequest): Observable<LoginResponse> {
    return this.gateway.refresh(request).pipe(
      tap((response) => {
        this.tokens.hydrateFromLogin(response);
      }),
    );
  }

  /** Clears client session state without calling the server. */
  logoutLocal(): void {
    this.tokens.clear();
    this.demoStore.logout();
  }

  /** Revokes the current server session, then clears local auth state. */
  logout(): Observable<void> {
    if (!this.tokens.accessToken() && !this.tokens.canRefresh()) {
      this.logoutLocal();
      return of(undefined);
    }

    return this.gateway.logout().pipe(
      tap(() => this.logoutLocal()),
      catchError(() => {
        this.logoutLocal();
        return of(undefined);
      }),
    );
  }
}
