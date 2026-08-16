import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { SESSION_GATEWAY } from './session.gateway';
import { SessionSummary } from './session.models';

@Injectable({ providedIn: 'root' })
export class SessionFacade {
  private readonly gateway = inject(SESSION_GATEWAY);

  listActiveSessions(): Observable<SessionSummary[]> {
    return this.gateway.listActiveSessions();
  }

  signOutSession(sessionId: string): Observable<void> {
    return this.gateway.signOutSession(sessionId);
  }

  signOutAllOthers(): Observable<void> {
    return this.gateway.signOutAllOthers();
  }
}
