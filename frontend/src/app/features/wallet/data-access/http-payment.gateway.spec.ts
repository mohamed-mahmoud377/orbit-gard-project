import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { HttpPaymentGateway } from './http-payment.gateway';
import { PaymentApiError } from './payment.models';

describe('HttpPaymentGateway', () => {
  let gateway: HttpPaymentGateway;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), HttpPaymentGateway],
    });
    gateway = TestBed.inject(HttpPaymentGateway);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('posts major-unit EGP amounts to the top-up endpoint', () => {
    gateway.initiateTopUp({ amount: 500 }).subscribe((response) => {
      expect(response).toEqual({
        paymentId: '82fb922f-1c0f-443d-9e02-245bb87d6139',
        redirectUrl: 'https://accept.paymob.com/unifiedcheckout/?publicKey=x&clientSecret=y',
      });
    });

    const req = http.expectOne('/api/v1/payments/topup');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ amount: 500 });
    req.flush({
      paymentId: '82fb922f-1c0f-443d-9e02-245bb87d6139',
      redirectUrl: 'https://accept.paymob.com/unifiedcheckout/?publicKey=x&clientSecret=y',
    });
  });

  it('accepts 201 Created from initiation', () => {
    gateway.initiateTopUp({ amount: 100 }).subscribe((response) => {
      expect(response.paymentId).toBeTruthy();
    });
    const req = http.expectOne('/api/v1/payments/topup');
    req.flush(
      {
        paymentId: '82fb922f-1c0f-443d-9e02-245bb87d6139',
        redirectUrl: 'https://accept.paymob.com/unifiedcheckout/?publicKey=x&clientSecret=y',
      },
      { status: 201, statusText: 'Created' },
    );
  });

  it('maps problem+json initiation errors', () => {
    gateway.initiateTopUp({ amount: 10 }).subscribe({
      next: () => {
        throw new Error('expected error');
      },
      error: (error: unknown) => {
        expect(error).toBeInstanceOf(PaymentApiError);
        expect((error as PaymentApiError).code).toBe('AMOUNT_BELOW_MINIMUM');
      },
    });
    const req = http.expectOne('/api/v1/payments/topup');
    req.flush(
      {
        status: 400,
        code: 'AMOUNT_BELOW_MINIMUM',
        title: 'Amount below minimum',
        fieldErrors: [{ field: 'amount', code: 'AMOUNT_BELOW_MINIMUM' }],
      },
      { status: 400, statusText: 'Bad Request' },
    );
  });

  it('loads payment status', () => {
    gateway.getStatus('82fb922f-1c0f-443d-9e02-245bb87d6139').subscribe((response) => {
      expect(response).toEqual({
        paymentId: '82fb922f-1c0f-443d-9e02-245bb87d6139',
        status: 'AWAITING_CONFIRMATION',
      });
    });
    const req = http.expectOne('/api/v1/payments/82fb922f-1c0f-443d-9e02-245bb87d6139/status');
    expect(req.request.method).toBe('GET');
    req.flush({
      paymentId: '82fb922f-1c0f-443d-9e02-245bb87d6139',
      status: 'AWAITING_CONFIRMATION',
    });
  });

  it('maps empty 404 status responses to payment-not-found', () => {
    gateway.getStatus('82fb922f-1c0f-443d-9e02-245bb87d6139').subscribe({
      next: () => {
        throw new Error('expected error');
      },
      error: (error: unknown) => {
        expect(error).toBeInstanceOf(PaymentApiError);
        expect((error as PaymentApiError).code).toBe('PAYMENT_NOT_FOUND');
      },
    });
    const req = http.expectOne('/api/v1/payments/82fb922f-1c0f-443d-9e02-245bb87d6139/status');
    req.flush(null, { status: 404, statusText: 'Not Found' });
  });
});
