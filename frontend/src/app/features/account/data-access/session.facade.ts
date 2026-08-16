import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { SESSION_GATEWAY } from './session.gateway';
import { SessionSummary } from './session.models';

@Injectable({ providedIn: 'root' })
export class SessionFacade {
  private readonly gateway = inject(SESSION_GATEWAY);

  listActiveSessions(): Observable<SessionSummary[]> {
    return this.gateway.listActiveSessions();
  }

  getActiveSessionCount(): Observable<number> {
    return this.listActiveSessions().pipe(map((sessions) => sessions.length));
  }

  signOutSession(sessionId: string): Observable<void> {
    return this.gateway.signOutSession(sessionId);
  }

  signOutAllOthers(): Observable<void> {
    return this.gateway.signOutAllOthers();
  }
}
