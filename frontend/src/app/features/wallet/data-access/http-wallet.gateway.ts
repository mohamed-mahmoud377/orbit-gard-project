import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';

import { networkProblem, problemFromHttpError } from '../../../core/http/problem-details';
import { environment } from '../../../../environments/environment';
import {
  BackendUserProfileResponse,
  normalizeUserProfile,
} from './user-api.adapter';
import {
  BackendInternalTransferResponse,
  BackendWalletBalanceResponse,
  BackendWalletTransactionPageResponse,
  BackendWalletTransactionSummaryResponse,
  normalizeInternalTransfer,
  normalizeTransactionSummary,
  normalizeWalletBalance,
  normalizeWalletTransactionPage,
} from './wallet-api.adapter';
import { WalletGateway } from './wallet.gateway';
import {
  InternalTransferRequest,
  InternalTransferResult,
  WalletApiError,
  WalletTransactionPage,
  WalletTransactionSummary,
} from './wallet.models';

@Injectable({ providedIn: 'root' })
export class HttpWalletGateway implements WalletGateway {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl.replace(/\/$/, '');

  getCurrentUser() {
    return this.http
      .get<BackendUserProfileResponse>(`${this.baseUrl}/users/me`)
      .pipe(
        map((body) => normalizeUserProfile(body)),
        catchError((error) => this.mapError(error)),
      );
  }

  getWallet() {
    return this.http.get<BackendWalletBalanceResponse>(`${this.baseUrl}/wallet`).pipe(
      map((body) => normalizeWalletBalance(body)),
      catchError((error) => this.mapError(error)),
    );
  }

  listTransactions(page: number): Observable<WalletTransactionPage> {
    const params = new HttpParams().set('page', String(page));
    return this.http
      .get<BackendWalletTransactionPageResponse>(`${this.baseUrl}/wallet/transactions`, {
        params,
      })
      .pipe(
        map((body) => ({
          transactions: normalizeWalletTransactionPage(body),
          page: body.page,
          totalPages: body.totalPages,
          totalElements: body.totalElements,
          last: body.last,
        })),
        catchError((error) => this.mapError(error)),
      );
  }

  getTransactionSummary(): Observable<WalletTransactionSummary> {
    return this.http
      .get<BackendWalletTransactionSummaryResponse>(
        `${this.baseUrl}/wallet/transactions/summary`,
      )
      .pipe(
        map((body) => normalizeTransactionSummary(body)),
        catchError((error) => this.mapError(error)),
      );
  }

  internalTransfer(request: InternalTransferRequest): Observable<InternalTransferResult> {
    return this.http
      .post<BackendInternalTransferResponse>(`${this.baseUrl}/wallet/internal/transfer`, {
        receiverUsername: request.receiverUsername,
        amount: request.amountMajor,
      })
      .pipe(
        map((body) => normalizeInternalTransfer(body)),
        catchError((error) => this.mapError(error)),
      );
  }

  private mapError(error: unknown): Observable<never> {
    if (error instanceof WalletApiError) {
      return throwError(() => error);
    }
    if (error instanceof HttpErrorResponse) {
      return throwError(() => new WalletApiError(problemFromHttpError(error)));
    }
    return throwError(() => new WalletApiError(networkProblem()));
  }
}
