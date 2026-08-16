import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

import { SessionSummary } from './session.models';

export interface SessionGateway {
  listActiveSessions(): Observable<SessionSummary[]>;
  signOutSession(sessionId: string): Observable<void>;
  signOutAllOthers(): Observable<void>;
}

export const SESSION_GATEWAY = new InjectionToken<SessionGateway>('SESSION_GATEWAY');
