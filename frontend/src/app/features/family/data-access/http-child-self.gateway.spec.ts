import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { HttpChildSelfGateway } from './http-child-self.gateway';

describe('HttpChildSelfGateway', () => {
  let gateway: HttpChildSelfGateway;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), HttpChildSelfGateway],
    });
    gateway = TestBed.inject(HttpChildSelfGateway);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('loads the wallet with both limit windows and pending money', () => {
    gateway.getWallet().subscribe((wallet) => {
      expect(wallet.availableMinor).toBe(24500);
      expect(wallet.balanceMinor).toBe(29500);
      expect(wallet.heldMinor).toBe(5000);
      expect(wallet.perTransactionMinor).toBe(10000);
      expect(wallet.today).toEqual({
        spentMinor: 6000,
        maxMinor: 15000,
        remainingMinor: 9000,
        resetsAt: 'midnight',
      });
      expect(wallet.month).toEqual({
        spentMinor: 25500,
        maxMinor: 100000,
        remainingMinor: 74500,
        resetsOn: '2026-09-01',
      });
      expect(wallet.pending).toEqual([
        { id: 'pending-1', merchant: '@dad', amountMinor: 4000, time: '12:15' },
      ]);
    });

    const req = http.expectOne('/api/v1/child/wallet');
    expect(req.request.method).toBe('GET');
    req.flush(walletBody());
  });

  it('signs recent activity from the direction, not the amount', () => {
    gateway.getWallet().subscribe((wallet) => {
      // The server sends 50.00 positive with direction DEBIT; rendering it
      // unsigned would show a purchase as money coming in.
      expect(wallet.recentActivity[0]).toEqual(
        expect.objectContaining({ title: 'School canteen', amount: -5000 }),
      );
      expect(wallet.recentActivity[1]).toEqual(
        expect.objectContaining({ title: 'Transfer', amount: 40000 }),
      );
    });

    http.expectOne('/api/v1/child/wallet').flush(walletBody());
  });

  it('loads the activity summary', () => {
    gateway.getActivitySummary().subscribe((summary) => {
      expect(summary).toEqual({
        spentTodayMinor: 6000,
        spentThisMonthMinor: 25500,
        receivedThisMonthMinor: 80000,
        blockedCount: 0,
      });
    });

    const req = http.expectOne('/api/v1/child/activity/summary');
    expect(req.request.method).toBe('GET');
    req.flush({
      spentToday: '60.00',
      spentThisMonth: '255.00',
      receivedThisMonth: '800.00',
      blockedCount: 0,
    });
  });

  it('pages transactions without taking an id', () => {
    gateway.listTransactions(1, 20).subscribe((page) => {
      expect(page.page).toBe(1);
      expect(page.last).toBe(true);
      expect(page.items[0]).toEqual(
        expect.objectContaining({ title: 'School canteen', amount: -5000 }),
      );
    });

    const req = http.expectOne(
      (r) =>
        r.url === '/api/v1/child/transactions' &&
        r.params.get('page') === '1' &&
        r.params.get('size') === '20',
    );
    expect(req.request.method).toBe('GET');
    req.flush({
      content: [debitRow()],
      page: 1,
      size: 20,
      totalElements: 21,
      totalPages: 2,
      first: false,
      last: true,
    });
  });

  it('surfaces the 403 a non-child account gets', () => {
    const seen: { code?: string; status?: number } = {};
    gateway.getWallet().subscribe({
      error: (error) => {
        seen.code = error.code;
        seen.status = error.status;
      },
    });

    http.expectOne('/api/v1/child/wallet').flush(
      { code: 'ACCESS_DENIED', title: 'Access denied', status: 403 },
      { status: 403, statusText: 'Forbidden' },
    );

    expect(seen.status).toBe(403);
    expect(seen.code).toBe('ACCESS_DENIED');
  });

  function debitRow() {
    return {
      id: 'tx-1',
      merchant: 'School canteen',
      reference: 'TXN-001',
      channel: '/pay',
      transactionDirection: 'DEBIT',
      amount: '50.00',
      status: 'COMPLETED',
      reason: null,
      occurredAt: '2026-08-01T12:00:00Z',
    };
  }

  function walletBody() {
    return {
      available: '245.00',
      balance: '295.00',
      held: '50.00',
      today: { spent: '60.00', max: '150.00', remaining: '90.00', resetsAt: 'midnight' },
      month: { spent: '255.00', max: '1000.00', remaining: '745.00', resetsOn: '2026-09-01' },
      perTransaction: '100.00',
      pending: [{ id: 'pending-1', merchant: '@dad', amount: '40.00', time: '12:15' }],
      recentActivity: [
        debitRow(),
        {
          id: 'tx-2',
          merchant: null,
          reference: 'TXN-002',
          channel: '/transfer',
          transactionDirection: 'CREDIT',
          amount: '400.00',
          status: 'COMPLETED',
          reason: null,
          occurredAt: '2026-08-02T09:00:00Z',
        },
      ],
    };
  }
});
