import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';

import { networkProblem, problemFromHttpError } from '../../../core/http/problem-details';
import { environment } from '../../../../environments/environment';
import { PasswordGateway } from './password.gateway';
import {
  ChangePasswordRequest,
  ChangePasswordResponse,
  PasswordApiError,
} from './password.models';

interface BackendChangePasswordResponse {
  readonly message: string;
  readonly devicesSignedOut: number;
}

@Injectable({ providedIn: 'root' })
export class HttpPasswordGateway implements PasswordGateway {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl.replace(/\/$/, '');

  changePassword(request: ChangePasswordRequest): Observable<ChangePasswordResponse> {
    return this.http
      .post<BackendChangePasswordResponse>(`${this.baseUrl}/password/change`, request)
      .pipe(
        map((body) => ({
          message: body.message,
          devicesSignedOut: body.devicesSignedOut,
        })),
        catchError((error) => this.mapError(error)),
      );
  }

  private mapError(error: unknown): Observable<never> {
    if (error instanceof PasswordApiError) {
      return throwError(() => error);
    }
    if (error instanceof HttpErrorResponse) {
      return throwError(() => new PasswordApiError(problemFromHttpError(error)));
    }
    return throwError(() => new PasswordApiError(networkProblem()));
  }
}
