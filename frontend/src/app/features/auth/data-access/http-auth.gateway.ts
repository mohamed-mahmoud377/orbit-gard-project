import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';

import { environment } from '../../../../environments/environment';
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
  ProblemDetails,
  RegisterRequest,
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

  private mapError(error: unknown): Observable<never> {
    if (error instanceof AuthApiError) {
      return throwError(() => error);
    }

    if (error instanceof HttpErrorResponse) {
      const body = error.error as Partial<ProblemDetails> | null;
      const code = body && typeof body === 'object' ? body.code : undefined;
      if (body && typeof body === 'object' && typeof code === 'string') {
        return throwError(
          () =>
            new AuthApiError({
              type: body.type,
              title: body.title,
              status: body.status ?? error.status,
              code,
              detail: body.detail,
              instance: body.instance,
              timestamp: body.timestamp,
              traceId: body.traceId,
              fieldErrors: body.fieldErrors,
              retryAfterSeconds: body.retryAfterSeconds,
            }),
        );
      }

      return throwError(
        () =>
          new AuthApiError({
            status: error.status || 0,
            code: error.status === 0 ? 'NETWORK_ERROR' : 'UNKNOWN',
            title: error.statusText || 'Request failed',
          }),
      );
    }

    return throwError(
      () =>
        new AuthApiError({
          status: 0,
          code: 'NETWORK_ERROR',
          title: 'Network error',
        }),
    );
  }
}
