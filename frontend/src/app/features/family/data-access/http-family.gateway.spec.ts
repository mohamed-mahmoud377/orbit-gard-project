import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { HttpFamilyGateway } from './http-family.gateway';

describe('HttpFamilyGateway', () => {
  let gateway: HttpFamilyGateway;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), HttpFamilyGateway],
    });
    gateway = TestBed.inject(HttpFamilyGateway);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('loads family overview', () => {
    gateway.getOverview().subscribe((overview) => {
      expect(overview).toEqual({
        childrenCount: 2,
        allocatedThisMonthMinor: 80000,
        spentThisMonthMinor: 41500,
        blockedAttempts: 3,
      });
    });

    const req = http.expectOne('/api/v1/family/overview');
    expect(req.request.method).toBe('GET');
    req.flush({
      childrenCount: 2,
      allocatedThisMonth: '800.00',
      spentThisMonth: '415.00',
      blockedAttempts: 3,
    });
  });

  it('lists children with limit progress', () => {
    gateway.listChildren().subscribe((children) => {
      expect(children.length).toBe(1);
      expect(children[0]).toEqual(
        expect.objectContaining({
          id: 'child-1',
          name: 'Youssef Mahmoud',
          handle: '@youssef',
          username: 'youssef',
          status: 'ACTIVE',
          availableMinor: 24500,
          balanceMinor: 29500,
          heldMinor: 5000,
          limits: {
            today: { spentMinor: 6000, maxMinor: 15000 },
            month: { spentMinor: 25500, maxMinor: 100000 },
            perTransactionMinor: 10000,
          },
        }),
      );
    });

    const req = http.expectOne('/api/v1/family/children');
    req.flush([
      {
        id: 'child-1',
        name: 'Youssef Mahmoud',
        handle: '@youssef',
        status: 'ACTIVE',
        available: '245.00',
        balance: '295.00',
        held: '50.00',
        limits: {
          today: { spent: '60.00', max: '150.00' },
          month: { spent: '255.00', max: '1000.00' },
          perTransaction: '100.00',
        },
      },
    ]);
  });

  it('loads child detail and activity', () => {
    gateway.getChild('child-1').subscribe((detail) => {
      expect(detail.allocatedThisMonthMinor).toBe(50000);
      expect(detail.limits.today.remainingMinor).toBe(9000);
    });

    const detailReq = http.expectOne('/api/v1/family/children/child-1');
    detailReq.flush({
      id: 'child-1',
      name: 'Youssef Mahmoud',
      handle: '@youssef',
      status: 'ACTIVE',
      walletOpenedAt: '2026-06-12',
      available: '245.00',
      balance: '295.00',
      held: '50.00',
      allocatedThisMonth: '500.00',
      limits: {
        today: { spent: '60.00', max: '150.00', remaining: '90.00' },
        month: { spent: '255.00', max: '1000.00', remaining: '745.00' },
        perTransaction: '100.00',
      },
    });

    gateway.listChildTransactions('child-1', 0, 10).subscribe((page) => {
      expect(page.items[0]).toEqual(
        expect.objectContaining({
          title: 'School canteen',
          amount: -5000,
          status: 'COMPLETED',
        }),
      );
    });

    const txReq = http.expectOne(
      (r) => r.url === '/api/v1/family/children/child-1/transactions' && r.params.get('size') === '10',
    );
    txReq.flush({
      content: [
        {
          id: 'tx-1',
          merchant: 'School canteen',
          reference: 'TXN-001',
          channel: '/pay',
          amount: '-50.00',
          status: 'COMPLETED',
          reason: null,
          occurredAt: '2026-08-01T12:00:00Z',
        },
      ],
      page: 0,
      size: 10,
      totalElements: 1,
      totalPages: 1,
      first: true,
      last: true,
    });
  });

  it('adds a child', () => {
    gateway
      .addChild({
        firstName: 'Mariam',
        lastName: 'Mahmoud',
        username: 'mariam',
        password: 'Mariam@123',
        confirmPassword: 'Mariam@123',
        maxPerTransactionMajor: 100,
        dailyLimitMajor: 150,
        monthlyLimitMajor: 1000,
        startingAllocationMajor: 200,
      })
      .subscribe((result) => {
        expect(result.firstName).toBe('Mariam');
        expect(result.lastName).toBe('Mahmoud');
      });

    const req = http.expectOne('/api/v1/auth/add-child');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      firstName: 'Mariam',
      lastName: 'Mahmoud',
      username: 'mariam',
      password: 'Mariam@123',
      confirmPassword: 'Mariam@123',
      maxPerTransaction: 100,
      dailyLimit: 150,
      monthlyLimit: 1000,
      startingAllocation: 200,
    });
    req.flush({
      id: 'new-child',
      username: 'mariam',
      firstName: 'Mariam',
      lastName: 'Mahmoud',
      status: 'ACTIVE',
    });
  });
});
