import { describe, expect, it } from 'vitest';

import {
  majorUnitsToMinor,
  minorUnitsToMajor,
  normalizeWalletBalance,
  normalizeWalletTransaction,
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

  it('normalizes wallet transactions', () => {
    const transaction = normalizeWalletTransaction(
      {
        id: '1',
        transactionPublicId: 'txn-123',
        type: 'TOPUP',
        direction: 'CREDIT',
        status: 'COMPLETED',
        amount: 50,
        description: 'Wallet top-up',
        counterparty: null,
        createdAt: '2026-07-25T10:00:00Z',
      },
      'user-1',
    );

    expect(transaction.id).toBe('txn-123');
    expect(transaction.walletOwnerId).toBe('user-1');
    expect(transaction.type).toBe('top-up');
    expect(transaction.status).toBe('completed');
    expect(transaction.amountMinor).toBe(5000);
    expect(transaction.title).toBe('Wallet top-up');
  });
});
