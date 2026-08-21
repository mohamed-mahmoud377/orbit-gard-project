import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin } from 'rxjs';

import { CHILD_SELF_GATEWAY } from './child-self.gateway';
import { ChildActivitySummary, ChildWalletPageData } from './child-self.models';
import { ChildActivityPageResult } from './family.models';

@Injectable({ providedIn: 'root' })
export class ChildSelfFacade {
  private readonly gateway = inject(CHILD_SELF_GATEWAY);

  /**
   * The wallet screen needs both calls before it can paint a coherent picture,
   * so they fail together rather than leaving half a screen filled in.
   */
  loadWalletPage(): Observable<ChildWalletPageData> {
    return forkJoin({
      wallet: this.gateway.getWallet(),
      summary: this.gateway.getActivitySummary(),
    });
  }

  loadActivitySummary(): Observable<ChildActivitySummary> {
    return this.gateway.getActivitySummary();
  }

  loadActivity(page = 0, size = 20): Observable<ChildActivityPageResult> {
    return this.gateway.listTransactions(page, size);
  }
}
