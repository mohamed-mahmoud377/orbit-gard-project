import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';

import { networkProblem, problemFromHttpError } from '../../../core/http/problem-details';
import { environment } from '../../../../environments/environment';
import {
  BackendChildActivitySummaryResponse,
  BackendChildWalletResponse,
  normalizeChildActivitySummary,
  normalizeChildWallet,
} from './child-self-api.adapter';
import { ChildSelfGateway } from './child-self.gateway';
import { ChildActivitySummary, ChildWalletSnapshot } from './child-self.models';
import {
  BackendChildTransactionPageResponse,
  normalizeChildTransactionPage,
} from './family-api.adapter';
import { ChildActivityPageResult, FamilyApiError } from './family.models';

@Injectable({ providedIn: 'root' })
export class HttpChildSelfGateway implements ChildSelfGateway {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl.replace(/\/$/, '');

  getWallet(): Observable<ChildWalletSnapshot> {
    return this.http
      .get<BackendChildWalletResponse>(`${this.baseUrl}/child/wallet`)
      .pipe(
        map((body) => normalizeChildWallet(body)),
        catchError((error) => this.mapError(error)),
      );
  }

  getActivitySummary(): Observable<ChildActivitySummary> {
    return this.http
      .get<BackendChildActivitySummaryResponse>(`${this.baseUrl}/child/activity/summary`)
      .pipe(
        map((body) => normalizeChildActivitySummary(body)),
        catchError((error) => this.mapError(error)),
      );
  }

  listTransactions(page: number, size: number): Observable<ChildActivityPageResult> {
    const params = new HttpParams().set('page', String(page)).set('size', String(size));
    return this.http
      .get<BackendChildTransactionPageResponse>(`${this.baseUrl}/child/transactions`, { params })
      .pipe(
        // Byte-identical page shape to the parent's per-child feed, so the
        // parent-side normalizer is the one that runs here too.
        map((body) => normalizeChildTransactionPage(body)),
        catchError((error) => this.mapError(error)),
      );
  }

  private mapError(error: unknown): Observable<never> {
    if (error instanceof FamilyApiError) {
      return throwError(() => error);
    }
    if (error instanceof HttpErrorResponse) {
      return throwError(() => new FamilyApiError(problemFromHttpError(error)));
    }
    return throwError(() => new FamilyApiError(networkProblem()));
  }
}
