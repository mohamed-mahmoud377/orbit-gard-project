import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { vi } from 'vitest';

import { Transaction } from '../../../shared/models';
import { TransactionCacheStore } from './transaction-cache.store';
import { WALLET_GATEWAY } from './wallet.gateway';
import { WalletFacade } from './wallet.facade';
import { WalletTransactionPage } from './wallet.models';

describe('WalletFacade findTransaction', () => {
  let facade: WalletFacade;
  let cache: TransactionCacheStore;
  let listTransactions: ReturnType<typeof vi.fn>;

  const transaction = (
    id: string,
    backendId: string,
    occurredAt: string,
  ): Transaction => ({
    id,
    backendId,
    walletOwnerId: 'user-1',
    type: 'top-up',
    status: 'completed',
    amountMinor: 10000,
    currency: 'EGP',
    title: 'Top-up',
    subtitle: '',
    occurredAt,
  });

  const page = (
    transactions: Transaction[],
    pageNum: number,
    totalPages: number,
  ): WalletTransactionPage => ({
    transactions,
    page: pageNum,
    totalPages,
    totalElements: transactions.length * totalPages,
    last: pageNum === totalPages - 1,
  });

  beforeEach(() => {
    listTransactions = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        WalletFacade,
        TransactionCacheStore,
        {
          provide: WALLET_GATEWAY,
          useValue: { listTransactions },
        },
      ],
    });
    facade = TestBed.inject(WalletFacade);
    cache = TestBed.inject(TransactionCacheStore);
  });

  it('returns a cached transaction without calling the gateway', async () => {
    const cached = transaction('ref-1', 'backend-1', '2026-01-01T00:00:00Z');
    cache.remember([cached]);

    const result = await firstValueFrom(facade.findTransaction('ref-1'));
    expect(result).toEqual(cached);
    expect(listTransactions).not.toHaveBeenCalled();
  });

  it('searches newest pages first and stops after a match', async () => {
    const newest = transaction('ref-new', 'backend-new', '2026-02-01T00:00:00Z');
    const oldest = transaction('ref-old', 'backend-old', '2026-01-01T00:00:00Z');
    const firstPage = page([oldest], 0, 2);

    listTransactions.mockImplementation((pageNum: number) => {
      if (pageNum === 0) return of(firstPage);
      if (pageNum === 1) return of(page([newest], 1, 2));
      return of(page([], pageNum, 2));
    });

    const result = await firstValueFrom(facade.findTransaction('ref-new'));
    expect(result?.id).toBe('ref-new');
    expect(listTransactions).toHaveBeenCalledTimes(2);
    expect(listTransactions).toHaveBeenNthCalledWith(1, 0);
    expect(listTransactions).toHaveBeenNthCalledWith(2, 1);
  });

  it('traverses all pages when the transaction is not found', async () => {
    const firstPage = page([transaction('a', 'b', '2026-01-01T00:00:00Z')], 0, 3);
    listTransactions.mockImplementation((pageNum: number) => {
      if (pageNum === 0) return of(firstPage);
      return of(page([], pageNum, 3));
    });

    const result = await firstValueFrom(facade.findTransaction('missing'));
    expect(result).toBeNull();
    expect(listTransactions).toHaveBeenCalledTimes(3);
  });
});
