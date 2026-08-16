import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

import { WalletSnapshot } from '../../../shared/models';
import { UserAccountSummary } from './user-api.adapter';
import { WalletTransactionPage } from './wallet.models';

export interface WalletGateway {
  getCurrentUser(): Observable<UserAccountSummary>;
  getWallet(): Observable<WalletSnapshot>;
  listTransactions(page: number): Observable<WalletTransactionPage>;
}

export const WALLET_GATEWAY = new InjectionToken<WalletGateway>('WALLET_GATEWAY');
