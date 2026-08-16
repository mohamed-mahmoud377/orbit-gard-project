import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';

import { ProblemDetails } from '../../auth/data-access/auth.models';
import { environment } from '../../../../environments/environment';
import { PROFILE_GATEWAY, ProfileGateway } from './profile.gateway';
import { ProfileApiError, ProfileDetails, UpdateProfileRequest } from './profile.models';

interface BackendProfileResponse {
  readonly firstName: string;
  readonly lastName: string;
  readonly username: string;
  readonly email: string;
  readonly phoneNumber: string;
  readonly nonRevokedSessionCount?: number;
}

@Injectable({ providedIn: 'root' })
export class HttpProfileGateway implements ProfileGateway {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl.replace(/\/$/, '');

  getProfile(): Observable<ProfileDetails> {
    return this.http.get<BackendProfileResponse>(`${this.baseUrl}/profile`).pipe(
      map((body) => this.normalize(body)),
      catchError((error) => this.mapError(error)),
    );
  }

  updateProfile(request: UpdateProfileRequest): Observable<ProfileDetails> {
    return this.http.put<BackendProfileResponse>(`${this.baseUrl}/profile`, request).pipe(
      map((body) => this.normalize(body)),
      catchError((error) => this.mapError(error)),
    );
  }

  private normalize(body: BackendProfileResponse): ProfileDetails {
    return {
      firstName: body.firstName,
      lastName: body.lastName,
      username: body.username,
      email: body.email,
      phoneNumber: body.phoneNumber,
      ...(body.nonRevokedSessionCount !== undefined
        ? { nonRevokedSessionCount: body.nonRevokedSessionCount }
        : {}),
    };
  }

  private mapError(error: unknown): Observable<never> {
    if (error instanceof ProfileApiError) {
      return throwError(() => error);
    }
    if (error instanceof HttpErrorResponse) {
      const body = error.error as Partial<ProblemDetails> | null;
      const code = body && typeof body === 'object' ? body.code : undefined;
      if (body && typeof body === 'object' && typeof code === 'string') {
        return throwError(
          () =>
            new ProfileApiError({
              status: body.status ?? error.status,
              code,
              title: body.title,
              detail: body.detail,
              fieldErrors: body.fieldErrors,
            }),
        );
      }
      return throwError(
        () =>
          new ProfileApiError({
            status: error.status || 0,
            code: error.status === 0 ? 'NETWORK_ERROR' : 'UNKNOWN',
            title: error.statusText || 'Request failed',
          }),
      );
    }
    return throwError(
      () =>
        new ProfileApiError({
          status: 0,
          code: 'NETWORK_ERROR',
          title: 'Network error',
        }),
    );
  }
}
