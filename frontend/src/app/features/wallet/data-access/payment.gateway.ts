import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

import {
  PaymentStatusResponse,
  TopUpInitiateRequest,
  TopUpInitiateResponse,
} from './payment.models';

export interface PaymentGateway {
  initiateTopUp(request: TopUpInitiateRequest): Observable<TopUpInitiateResponse>;
  getStatus(paymentId: string): Observable<PaymentStatusResponse>;
}

export const PAYMENT_GATEWAY = new InjectionToken<PaymentGateway>('PAYMENT_GATEWAY');
