import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';

import { ProblemDetails } from '../../auth/data-access/auth.models';
import { environment } from '../../../../environments/environment';
import { PASSWORD_GATEWAY, PasswordGateway } from './password.gateway';
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
      const body = error.error as Partial<ProblemDetails> | null;
      const code = body && typeof body === 'object' ? body.code : undefined;
      if (body && typeof body === 'object' && typeof code === 'string') {
        return throwError(
          () =>
            new PasswordApiError({
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
          new PasswordApiError({
            status: error.status || 0,
            code: error.status === 0 ? 'NETWORK_ERROR' : 'UNKNOWN',
            title: error.statusText || 'Request failed',
          }),
      );
    }
    return throwError(
      () =>
        new PasswordApiError({
          status: 0,
          code: 'NETWORK_ERROR',
          title: 'Network error',
        }),
    );
  }
}
