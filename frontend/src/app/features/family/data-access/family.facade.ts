import { Injectable, inject } from '@angular/core';
import { forkJoin, Observable } from 'rxjs';

import { FAMILY_GATEWAY } from './family.gateway';
import {
  AddChildRequest,
  AddChildResult,
  ChildActivityPageResult,
  FamilyChildDetail,
  FamilyPageData,
  UpdateChildLimitsRequest,
} from './family.models';

@Injectable({ providedIn: 'root' })
export class FamilyFacade {
  private readonly gateway = inject(FAMILY_GATEWAY);

  loadFamilyPage(): Observable<FamilyPageData> {
    return forkJoin({
      overview: this.gateway.getOverview(),
      children: this.gateway.listChildren(),
    });
  }

  loadChildDetail(childId: string): Observable<FamilyChildDetail> {
    return this.gateway.getChild(childId);
  }

  saveLimits(childId: string, request: UpdateChildLimitsRequest): Observable<FamilyChildDetail> {
    return this.gateway.updateLimits(childId, request);
  }

  loadChildActivity(
    childId: string,
    page = 0,
    size = 20,
  ): Observable<ChildActivityPageResult> {
    return this.gateway.listChildTransactions(childId, page, size);
  }

  addChild(request: AddChildRequest): Observable<AddChildResult> {
    return this.gateway.addChild(request);
  }
}
