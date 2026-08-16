import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';

import { networkProblem, problemFromHttpError } from '../../../core/http/problem-details';
import { environment } from '../../../../environments/environment';
import {
  BackendAddChildResponse,
  BackendChildTransactionPageResponse,
  BackendFamilyChildDetailResponse,
  BackendFamilyChildResponse,
  BackendFamilyOverviewResponse,
  normalizeAddChildResult,
  normalizeChildDetail,
  normalizeChildCard,
  normalizeChildTransactionPage,
  normalizeFamilyOverview,
} from './family-api.adapter';
import { FamilyGateway } from './family.gateway';
import {
  AddChildRequest,
  AddChildResult,
  ChildActivityPageResult,
  FamilyApiError,
  FamilyChildCard,
  FamilyChildDetail,
  FamilyOverview,
  UpdateChildLimitsRequest,
} from './family.models';

@Injectable({ providedIn: 'root' })
export class HttpFamilyGateway implements FamilyGateway {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl.replace(/\/$/, '');

  getOverview(): Observable<FamilyOverview> {
    return this.http
      .get<BackendFamilyOverviewResponse>(`${this.baseUrl}/family/overview`)
      .pipe(
        map((body) => normalizeFamilyOverview(body)),
        catchError((error) => this.mapError(error)),
      );
  }

  listChildren(): Observable<readonly FamilyChildCard[]> {
    return this.http
      .get<readonly BackendFamilyChildResponse[]>(`${this.baseUrl}/family/children`)
      .pipe(
        map((body) => body.map((item) => normalizeChildCard(item))),
        catchError((error) => this.mapError(error)),
      );
  }

  getChild(childId: string): Observable<FamilyChildDetail> {
    return this.http
      .get<BackendFamilyChildDetailResponse>(`${this.baseUrl}/family/children/${childId}`)
      .pipe(
        map((body) => normalizeChildDetail(body)),
        catchError((error) => this.mapError(error)),
      );
  }

  updateLimits(childId: string, request: UpdateChildLimitsRequest): Observable<FamilyChildDetail> {
    const body: Record<string, number> = {};
    if (request.maxPerTransactionMajor != null) {
      body['maxPerTransaction'] = request.maxPerTransactionMajor;
    }
    if (request.dailyLimitMajor != null) {
      body['dailyLimit'] = request.dailyLimitMajor;
    }
    if (request.monthlyLimitMajor != null) {
      body['monthlyLimit'] = request.monthlyLimitMajor;
    }

    return this.http
      .patch<BackendFamilyChildDetailResponse>(
        `${this.baseUrl}/family/children/${childId}/limits`,
        body,
      )
      .pipe(
        map((response) => normalizeChildDetail(response)),
        catchError((error) => this.mapError(error)),
      );
  }

  listChildTransactions(
    childId: string,
    page: number,
    size: number,
  ): Observable<ChildActivityPageResult> {
    const params = new HttpParams().set('page', String(page)).set('size', String(size));
    return this.http
      .get<BackendChildTransactionPageResponse>(
        `${this.baseUrl}/family/children/${childId}/transactions`,
        { params },
      )
      .pipe(
        map((body) => {
          const normalized = normalizeChildTransactionPage(body);
          return {
            items: normalized.items,
            page: normalized.page,
            size: normalized.size,
            totalElements: normalized.totalElements,
            totalPages: normalized.totalPages,
            last: normalized.last,
          };
        }),
        catchError((error) => this.mapError(error)),
      );
  }

  addChild(request: AddChildRequest): Observable<AddChildResult> {
    const body: Record<string, unknown> = {
      firstName: request.firstName,
      lastName: request.lastName,
      username: request.username,
      password: request.password,
      confirmPassword: request.confirmPassword,
      maxPerTransaction: request.maxPerTransactionMajor,
      dailyLimit: request.dailyLimitMajor,
      monthlyLimit: request.monthlyLimitMajor,
    };
    if (request.startingAllocationMajor != null) {
      body['startingAllocation'] = request.startingAllocationMajor;
    }

    return this.http
      .post<BackendAddChildResponse>(`${this.baseUrl}/auth/add-child`, body)
      .pipe(
        map((response) => normalizeAddChildResult(response)),
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
