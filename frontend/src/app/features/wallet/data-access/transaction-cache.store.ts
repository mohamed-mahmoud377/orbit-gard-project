import { Injectable, signal } from '@angular/core';

import { Transaction } from '../../../shared/models';

@Injectable({ providedIn: 'root' })
export class TransactionCacheStore {
  private readonly byKey = signal(new Map<string, Transaction>());

  remember(transactions: readonly Transaction[]): void {
    const map = new Map(this.byKey());
    for (const transaction of transactions) {
      map.set(transaction.id, transaction);
      if (transaction.backendId) {
        map.set(transaction.backendId, transaction);
      }
    }
    this.byKey.set(map);
  }

  find(id: string): Transaction | undefined {
    return this.byKey().get(id);
  }

  clear(): void {
    this.byKey.set(new Map());
  }
}
