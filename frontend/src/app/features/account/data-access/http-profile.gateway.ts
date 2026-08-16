import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';

import { networkProblem, problemFromHttpError } from '../../../core/http/problem-details';
import { environment } from '../../../../environments/environment';
import { ProfileGateway } from './profile.gateway';
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
      return throwError(() => new ProfileApiError(problemFromHttpError(error)));
    }
    return throwError(() => new ProfileApiError(networkProblem()));
  }
}
