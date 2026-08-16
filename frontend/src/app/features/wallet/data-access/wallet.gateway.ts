import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

import { WalletSnapshot } from '../../../shared/models';
import { UserAccountSummary } from './user-api.adapter';
import {
  InternalTransferRequest,
  InternalTransferResult,
  WalletTransactionPage,
  WalletTransactionSummary,
} from './wallet.models';

export interface WalletGateway {
  getCurrentUser(): Observable<UserAccountSummary>;
  getWallet(): Observable<WalletSnapshot>;
  listTransactions(page: number): Observable<WalletTransactionPage>;
  getTransactionSummary(): Observable<WalletTransactionSummary>;
  internalTransfer(request: InternalTransferRequest): Observable<InternalTransferResult>;
}

export const WALLET_GATEWAY = new InjectionToken<WalletGateway>('WALLET_GATEWAY');
