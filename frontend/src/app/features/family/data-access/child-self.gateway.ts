import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

import { ChildActivityPageResult } from './family.models';
import { ChildActivitySummary, ChildWalletSnapshot } from './child-self.models';

/**
 * No method takes a child id: every call is scoped to the authenticated child
 * by the server, mirroring ChildController.
 */
export interface ChildSelfGateway {
  getWallet(): Observable<ChildWalletSnapshot>;
  getActivitySummary(): Observable<ChildActivitySummary>;
  listTransactions(page: number, size: number): Observable<ChildActivityPageResult>;
}

export const CHILD_SELF_GATEWAY = new InjectionToken<ChildSelfGateway>('CHILD_SELF_GATEWAY');
