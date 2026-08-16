import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError} from 'rxjs';

import { environment } from '../../../../environments/environment';
import { networkProblem, problemFromHttpError } from '../../../core/http/problem-details';
import {
  BackendLoginResponse,
  BackendRegisterResponse,
  BackendUsernameAvailabilityResponse,
  BackendVerifyResponse,
  normalizeLoginResponse,
  normalizeRegisterResponse,
  normalizeUsernameAvailability,
  normalizeVerifyResponse,
} from './http-auth-api.adapter';
import { AuthGateway } from './auth.gateway';
import {
  AuthApiError,
  LoginRequest,
  LoginResponse,
  PasswordResetRequest,
  PasswordResetRequestResponse,
  PasswordResetConfirmRequest,
  PasswordResetConfirmResponse,
  RegisterRequest,
  PromoCodeValidationResponse,
  RefreshTokenRequest,
  RegisterResponse,
  ResendVerifyRequest,
  ResendVerifyResponse,
  UsernameAvailabilityResponse,
  VerifyRequest,
  VerifyResponse,
} from './auth.models';

@Injectable({ providedIn: 'root' })
export class HttpAuthGateway implements AuthGateway {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl.replace(/\/$/, '');

  checkUsername(username: string): Observable<UsernameAvailabilityResponse> {
    const params = new HttpParams().set('username', username);
    return this.http
      .get<BackendUsernameAvailabilityResponse>(`${this.baseUrl}/auth/username-available`, { params })
      .pipe(
        map((body: BackendUsernameAvailabilityResponse) =>
          normalizeUsernameAvailability(username, body),
        ),
        catchError((error) => this.mapError(error)),
      );
  }

  validatePromoCode(code: string): Observable<PromoCodeValidationResponse> {
    const params = new HttpParams().set('code', code);
    return this.http
      .get<PromoCodeValidationResponse>(`${this.baseUrl}/auth/promo-code`, { params })
      .pipe(catchError((error) => this.mapError(error)));
  }

  register(request: RegisterRequest): Observable<RegisterResponse> {
    return this.http.post<BackendRegisterResponse>(`${this.baseUrl}/auth/register`, request).pipe(
      map((body: BackendRegisterResponse) => normalizeRegisterResponse(body)),
      catchError((error) => this.mapError(error)),
    );
  }

  verify(request: VerifyRequest): Observable<VerifyResponse> {
    return this.http.post<BackendVerifyResponse>(`${this.baseUrl}/auth/verify`, request).pipe(
      map((body: BackendVerifyResponse) => normalizeVerifyResponse(body)),
      catchError((error) => this.mapError(error)),
    );
  }

  resendVerification(request: ResendVerifyRequest): Observable<ResendVerifyResponse> {
    return this.http
      .post<ResendVerifyResponse>(`${this.baseUrl}/auth/verify/resend`, request)
      .pipe(catchError((error) => this.mapError(error)));
  }

  requestPasswordReset(
    request: PasswordResetRequest,
  ): Observable<PasswordResetRequestResponse> {
    return this.http
      .post<PasswordResetRequestResponse>(
        `${this.baseUrl}/password/reset/request`,
        request,
      )
      .pipe(catchError((error) => this.mapError(error)));
  }

  confirmPasswordReset(
    request: PasswordResetConfirmRequest,
  ): Observable<PasswordResetConfirmResponse> {
    return this.http
      .post<PasswordResetConfirmResponse>(
        `${this.baseUrl}/password/reset/confirm`,
        request,
      )
      .pipe(catchError((error) => this.mapError(error)));
  }


  login(request: LoginRequest): Observable<LoginResponse> {
    return this.http.post<BackendLoginResponse>(`${this.baseUrl}/auth/login`, request).pipe(
      map((body: BackendLoginResponse) => normalizeLoginResponse(body)),
      catchError((error) => this.mapError(error)),
    );
  }

  refresh(request: RefreshTokenRequest): Observable<LoginResponse> {
    return this.http.post<BackendLoginResponse>(`${this.baseUrl}/auth/refresh`, request).pipe(
      map((body: BackendLoginResponse) => normalizeLoginResponse(body)),
      catchError((error) => this.mapError(error)),
    );
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/auth/logout`, null).pipe(
      map(() => undefined),
      catchError((error) => this.mapError(error)),
    );
  }

  private mapError(error: unknown): Observable<never> {
    if (error instanceof AuthApiError) {
      return throwError(() => error);
    }

    if (error instanceof HttpErrorResponse) {
      return throwError(() => new AuthApiError(problemFromHttpError(error)));
    }

    return throwError(() => new AuthApiError(networkProblem()));
  }
}
