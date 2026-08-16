import { describe, expect, it } from 'vitest';

import {
  majorUnitsToMinor,
  minorUnitsToMajor,
  normalizeTransactionSummary,
  normalizeWalletBalance,
  normalizeWalletTransaction,
  sortTransactionsNewestFirst,
} from './wallet-api.adapter';

describe('wallet-api.adapter', () => {
  it('converts major units to minor units', () => {
    expect(majorUnitsToMinor(10.5)).toBe(1050);
    expect(majorUnitsToMinor('25.99')).toBe(2599);
    expect(majorUnitsToMinor('invalid')).toBe(0);
  });

  it('converts minor units to major units', () => {
    expect(minorUnitsToMajor(1050)).toBe(10.5);
  });

  it('normalizes wallet balance from backend major units', () => {
    const wallet = normalizeWalletBalance({
      balance: 100,
      held: 20.5,
      available: 79.5,
    });

    expect(wallet.currency).toBe('EGP');
    expect(wallet.totalMinor).toBe(10000);
    expect(wallet.heldMinor).toBe(2050);
    expect(wallet.availableMinor).toBe(7950);
    expect(wallet.updatedAt).toEqual(expect.any(String));
  });

  it('normalizes wallet transactions using the ledger reference as the public id', () => {
    const transaction = normalizeWalletTransaction(
      {
        id: 'backend-uuid',
        reference: 'TXN-20260725100000000-123456',
        type: 'TOPUP',
        direction: 'CREDIT',
        status: 'COMPLETED',
        amount: 50,
        balanceBefore: 0,
        balanceAfter: 50,
        description: 'Wallet top-up',
        counterparty: null,
        createdAt: '2026-07-25T10:00:00Z',
        resolvedAt: '2026-07-25T10:01:00Z',
      },
      'user-1',
    );

    expect(transaction.id).toBe('TXN-20260725100000000-123456');
    expect(transaction.backendId).toBe('backend-uuid');
    expect(transaction.walletOwnerId).toBe('user-1');
    expect(transaction.type).toBe('top-up');
    expect(transaction.status).toBe('completed');
    expect(transaction.amountMinor).toBe(5000);
    expect(transaction.balanceBeforeMinor).toBe(0);
    expect(transaction.balanceAfterMinor).toBe(5000);
    expect(transaction.title).toBe('Wallet top-up');
    expect(transaction.resolvedAt).toBe('2026-07-25T10:01:00Z');
  });

  it('normalizes transaction summary', () => {
    const summary = normalizeTransactionSummary({
      moneyInThisMonth: 1500,
      moneyOutThisMonth: 715,
      currentlyHeld: 50,
      rejectedCount: 2,
    });

    expect(summary.moneyInMinor).toBe(150000);
    expect(summary.moneyOutMinor).toBe(71500);
    expect(summary.heldMinor).toBe(5000);
    expect(summary.rejectedCount).toBe(2);
  });

  it('sorts transactions newest first', () => {
    const sorted = sortTransactionsNewestFirst([
      {
        id: 'older',
        walletOwnerId: '',
        type: 'top-up',
        status: 'completed',
        amountMinor: 100,
        currency: 'EGP',
        title: 'Older',
        subtitle: '',
        occurredAt: '2026-01-01T10:00:00Z',
      },
      {
        id: 'newer',
        walletOwnerId: '',
        type: 'top-up',
        status: 'completed',
        amountMinor: 200,
        currency: 'EGP',
        title: 'Newer',
        subtitle: '',
        occurredAt: '2026-02-01T10:00:00Z',
      },
    ]);

    expect(sorted.map((item) => item.id)).toEqual(['newer', 'older']);
  });
});
