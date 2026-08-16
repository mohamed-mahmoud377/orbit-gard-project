import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';

import { networkProblem, problemFromHttpError } from '../../../core/http/problem-details';
import { environment } from '../../../../environments/environment';
import { SessionGateway } from './session.gateway';
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
      return throwError(() => new SessionApiError(problemFromHttpError(error)));
    }
    return throwError(() => new SessionApiError(networkProblem()));
  }
}
