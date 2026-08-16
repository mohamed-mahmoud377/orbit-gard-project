import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';

import { ProblemDetails } from '../../auth/data-access/auth.models';
import { environment } from '../../../../environments/environment';
import { SESSION_GATEWAY, SessionGateway } from './session.gateway';
import { SessionApiError, SessionSummary } from './session.models';

interface BackendSessionSummaryResponse {
  readonly id: string;
  readonly deviceLabel: string;
  readonly location: string | null;
  readonly lastUsedAt: string;
  readonly currentDevice: boolean;
}

@Injectable({ providedIn: 'root' })
export class HttpSessionGateway implements SessionGateway {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl.replace(/\/$/, '');

  listActiveSessions(): Observable<SessionSummary[]> {
    return this.http.get<BackendSessionSummaryResponse[]>(`${this.baseUrl}/sessions`).pipe(
      map((sessions) =>
        sessions.map((session) => ({
          id: session.id,
          deviceLabel: session.deviceLabel,
          location: session.location,
          lastUsedAt: session.lastUsedAt,
          currentDevice: session.currentDevice,
        })),
      ),
      catchError((error) => this.mapError(error)),
    );
  }

  signOutSession(sessionId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/sessions/${sessionId}`).pipe(
      catchError((error) => this.mapError(error)),
    );
  }

  signOutAllOthers(): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/sessions/sign-out-others`, null).pipe(
      catchError((error) => this.mapError(error)),
    );
  }

  private mapError(error: unknown): Observable<never> {
    if (error instanceof SessionApiError) {
      return throwError(() => error);
    }
    if (error instanceof HttpErrorResponse) {
      const body = error.error as Partial<ProblemDetails> | null;
      const code = body && typeof body === 'object' ? body.code : undefined;
      if (body && typeof body === 'object' && typeof code === 'string') {
        return throwError(
          () =>
            new SessionApiError({
              status: body.status ?? error.status,
              code,
              title: body.title,
              detail: body.detail,
            }),
        );
      }
      return throwError(
        () =>
          new SessionApiError({
            status: error.status || 0,
            code: error.status === 0 ? 'NETWORK_ERROR' : 'UNKNOWN',
            title: error.statusText || 'Request failed',
          }),
      );
    }
    return throwError(
      () =>
        new SessionApiError({
          status: 0,
          code: 'NETWORK_ERROR',
          title: 'Network error',
        }),
    );
  }
}
