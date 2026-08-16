import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';

import { ProblemDetails } from '../../auth/data-access/auth.models';
import { environment } from '../../../../environments/environment';
import {
  BackendUserProfileResponse,
  normalizeUserProfile,
} from './user-api.adapter';
import {
  BackendWalletBalanceResponse,
  BackendWalletTransactionPageResponse,
  normalizeWalletBalance,
  normalizeWalletTransactionPage,
} from './wallet-api.adapter';
import { WALLET_GATEWAY, WalletGateway } from './wallet.gateway';
import { WalletApiError, WalletTransactionPage } from './wallet.models';

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

  private mapError(error: unknown): Observable<never> {
    if (error instanceof WalletApiError) {
      return throwError(() => error);
    }
    if (error instanceof HttpErrorResponse) {
      const body = error.error as Partial<ProblemDetails> | null;
      const code = body && typeof body === 'object' ? body.code : undefined;
      if (body && typeof body === 'object' && typeof code === 'string') {
        return throwError(
          () =>
            new WalletApiError({
              status: body.status ?? error.status,
              code,
              title: body.title,
              detail: body.detail,
            }),
        );
      }
      return throwError(
        () =>
          new WalletApiError({
            status: error.status || 0,
            code: error.status === 0 ? 'NETWORK_ERROR' : 'UNKNOWN',
            title: error.statusText || 'Request failed',
          }),
      );
    }
    return throwError(
      () =>
        new WalletApiError({
          status: 0,
          code: 'NETWORK_ERROR',
          title: 'Network error',
        }),
    );
  }
}
