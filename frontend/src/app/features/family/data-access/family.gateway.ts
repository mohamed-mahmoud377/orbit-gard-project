import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

import {
  AddChildRequest,
  AddChildResult,
  ChildActivityPageResult,
  FamilyChildCard,
  FamilyChildDetail,
  FamilyOverview,
  UpdateChildLimitsRequest,
} from './family.models';

export interface FamilyGateway {
  getOverview(): Observable<FamilyOverview>;
  listChildren(): Observable<readonly FamilyChildCard[]>;
  getChild(childId: string): Observable<FamilyChildDetail>;
  updateLimits(childId: string, request: UpdateChildLimitsRequest): Observable<FamilyChildDetail>;
  listChildTransactions(
    childId: string,
    page: number,
    size: number,
  ): Observable<ChildActivityPageResult>;
  addChild(request: AddChildRequest): Observable<AddChildResult>;
}

export const FAMILY_GATEWAY = new InjectionToken<FamilyGateway>('FAMILY_GATEWAY');
