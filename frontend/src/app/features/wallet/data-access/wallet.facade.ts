import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map } from 'rxjs';

import { Transaction, WalletSnapshot } from '../../../shared/models';
import { UserAccountSummary } from './user-api.adapter';
import { WALLET_GATEWAY } from './wallet.gateway';
import { DashboardData } from './wallet.models';

@Injectable({ providedIn: 'root' })
export class WalletFacade {
  private readonly gateway = inject(WALLET_GATEWAY);

  loadDashboard(): Observable<DashboardData> {
    return forkJoin({
      user: this.gateway.getCurrentUser(),
      wallet: this.gateway.getWallet(),
      page: this.gateway.listTransactions(0),
    }).pipe(
      map(({ user, wallet, page }) => ({
        user,
        wallet,
        recentTransactions: page.transactions.slice(0, 8),
      })),
    );
  }

  getCurrentUser(): Observable<UserAccountSummary> {
    return this.gateway.getCurrentUser();
  }

  getWallet(): Observable<WalletSnapshot> {
    return this.gateway.getWallet();
  }

  listTransactions(page: number) {
    return this.gateway.listTransactions(page);
  }
}
