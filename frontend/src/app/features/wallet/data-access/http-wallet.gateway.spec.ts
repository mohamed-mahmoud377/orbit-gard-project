import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { HttpWalletGateway } from './http-wallet.gateway';

describe('HttpWalletGateway', () => {
  let gateway: HttpWalletGateway;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [HttpWalletGateway, provideHttpClient(), provideHttpClientTesting()],
    });
    gateway = TestBed.inject(HttpWalletGateway);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('loads transaction summary', () => {
    let summary: unknown;
    gateway.getTransactionSummary().subscribe((value) => {
      summary = value;
    });

    const req = http.expectOne('/api/v1/wallet/transactions/summary');
    expect(req.request.method).toBe('GET');
    req.flush({
      moneyInThisMonth: 100,
      moneyOutThisMonth: 25,
      currentlyHeld: 10,
      rejectedCount: 1,
    });

    expect(summary).toEqual({
      moneyInMinor: 10000,
      moneyOutMinor: 2500,
      heldMinor: 1000,
      rejectedCount: 1,
    });
  });

  it('posts internal transfer', () => {
    let result: unknown;
    gateway.internalTransfer({ receiverUsername: 'sara', amountMajor: 50 }).subscribe((value) => {
      result = value;
    });

    const req = http.expectOne('/api/v1/wallet/internal/transfer');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ receiverUsername: 'sara', amount: 50 });
    req.flush({
      debitTransactionId: 'debit-id',
      debitReference: 'TXN-DEBIT',
      creditTransactionId: 'credit-id',
      creditReference: 'TXN-CREDIT',
      debitStatus: 'COMPLETED',
    });

    expect(result).toEqual({
      debitReference: 'TXN-DEBIT',
      creditReference: 'TXN-CREDIT',
      debitStatus: 'COMPLETED',
    });
  });
});
