import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, of, switchMap, tap } from 'rxjs';

import { Transaction, WalletSnapshot } from '../../../shared/models';
import { UserAccountSummary } from './user-api.adapter';
import { TransactionCacheStore } from './transaction-cache.store';
import { sortTransactionsNewestFirst } from './wallet-api.adapter';
import { WALLET_GATEWAY } from './wallet.gateway';
import {
  DashboardData,
  InternalTransferRequest,
  InternalTransferResult,
  LoadedTransactions,
  WalletTransactionPage,
  WalletTransactionSummary,
} from './wallet.models';

const RECENT_ACTIVITY_COUNT = 8;

@Injectable({ providedIn: 'root' })
export class WalletFacade {
  private readonly gateway = inject(WALLET_GATEWAY);
  private readonly cache = inject(TransactionCacheStore);

  loadDashboard(): Observable<DashboardData> {
    return forkJoin({
      user: this.gateway.getCurrentUser(),
      wallet: this.gateway.getWallet(),
      recentTransactions: this.loadRecentTransactions(RECENT_ACTIVITY_COUNT),
    });
  }

  loadRecentTransactions(count = RECENT_ACTIVITY_COUNT): Observable<Transaction[]> {
    return this.gateway.listTransactions(0).pipe(
      switchMap((firstPage) => {
        if (firstPage.totalElements === 0) {
          return of([] as Transaction[]);
        }

        const startPage = Math.max(0, firstPage.totalPages - 2);
        const pageRequests: Observable<WalletTransactionPage>[] = [];
        for (let page = startPage; page < firstPage.totalPages; page += 1) {
          pageRequests.push(page === 0 ? of(firstPage) : this.gateway.listTransactions(page));
        }

        return forkJoin(pageRequests).pipe(
          map((pages) => {
            const transactions = sortTransactionsNewestFirst(
              pages.flatMap((page) => [...page.transactions]),
            ).slice(0, count);
            this.cache.remember(transactions);
            return transactions;
          }),
        );
      }),
    );
  }

  loadTransactionsWindow(maxPages = 5): Observable<LoadedTransactions> {
    return this.gateway.listTransactions(0).pipe(
      switchMap((firstPage) => {
        if (firstPage.totalPages === 0) {
          return of({
            transactions: [] as Transaction[],
            totalElements: 0,
            oldestLoadedPage: 0,
            totalPages: 0,
          });
        }

        const pagesToLoad = Math.min(firstPage.totalPages, maxPages);
        const startPage = Math.max(0, firstPage.totalPages - pagesToLoad);
        return this.loadPageRange(firstPage, startPage, firstPage.totalPages - 1);
      }),
    );
  }

  loadOlderTransactions(
    oldestLoadedPage: number,
    currentTransactions: readonly Transaction[],
  ): Observable<LoadedTransactions> {
    if (oldestLoadedPage <= 0) {
      return this.gateway.listTransactions(0).pipe(
        map((firstPage) => ({
          transactions: currentTransactions,
          totalElements: firstPage.totalElements,
          oldestLoadedPage: 0,
          totalPages: firstPage.totalPages,
        })),
      );
    }

    const previousPage = oldestLoadedPage - 1;
    return forkJoin({
      page: this.gateway.listTransactions(previousPage),
      anchor: this.gateway.listTransactions(0),
    }).pipe(
      map(({ page, anchor }) => {
        const transactions = sortTransactionsNewestFirst([
          ...currentTransactions,
          ...page.transactions,
        ]);
        this.cache.remember(page.transactions);
        return {
          transactions,
          totalElements: anchor.totalElements,
          oldestLoadedPage: previousPage,
          totalPages: anchor.totalPages,
        };
      }),
    );
  }

  findTransaction(id: string): Observable<Transaction | null> {
    const cached = this.cache.find(id);
    if (cached) {
      return of(cached);
    }

    return this.gateway.listTransactions(0).pipe(
      switchMap((firstPage) => {
        if (firstPage.totalElements === 0) {
          return of(null);
        }

        if (firstPage.totalPages === 1) {
          this.cache.remember(firstPage.transactions);
          return of(this.matchTransaction(firstPage.transactions, id));
        }

        return this.loadPageRange(firstPage, 0, firstPage.totalPages - 1).pipe(
          map((loaded) => this.matchTransaction(loaded.transactions, id)),
        );
      }),
    );
  }

  getCurrentUser(): Observable<UserAccountSummary> {
    return this.gateway.getCurrentUser();
  }

  getWallet(): Observable<WalletSnapshot> {
    return this.gateway.getWallet();
  }

  getTransactionSummary(): Observable<WalletTransactionSummary> {
    return this.gateway.getTransactionSummary();
  }

  listTransactions(page: number): Observable<WalletTransactionPage> {
    return this.gateway.listTransactions(page).pipe(
      tap((pageResult) => this.cache.remember(pageResult.transactions)),
    );
  }

  internalTransfer(request: InternalTransferRequest): Observable<InternalTransferResult> {
    return this.gateway.internalTransfer(request);
  }

  rememberTransactions(transactions: readonly Transaction[]): void {
    this.cache.remember(transactions);
  }

  private loadPageRange(
    firstPage: WalletTransactionPage,
    startPage: number,
    endPage: number,
  ): Observable<LoadedTransactions> {
    const pageRequests: Observable<WalletTransactionPage>[] = [];
    for (let page = startPage; page <= endPage; page += 1) {
      pageRequests.push(
        page === 0 && firstPage.page === 0
          ? of(firstPage)
          : this.gateway.listTransactions(page),
      );
    }

    return forkJoin(pageRequests).pipe(
      map((pages) => {
        const transactions = sortTransactionsNewestFirst(
          pages.flatMap((page) => [...page.transactions]),
        );
        this.cache.remember(transactions);
        return {
          transactions,
          totalElements: firstPage.totalElements,
          oldestLoadedPage: startPage,
          totalPages: firstPage.totalPages,
        };
      }),
    );
  }

  private matchTransaction(
    transactions: readonly Transaction[],
    id: string,
  ): Transaction | null {
    return (
      transactions.find(
        (transaction) => transaction.id === id || transaction.backendId === id,
      ) ?? null
    );
  }
}
