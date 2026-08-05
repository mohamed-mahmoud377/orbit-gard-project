import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, expand, map, of, switchMap, take, timer } from 'rxjs';

import { PAYMENT_GATEWAY } from './payment.gateway';
import {
  PaymentStatusResponse,
  TopUpInitiateRequest,
  TopUpInitiateResponse,
  isPendingPaymentStatus,
  isTerminalPaymentStatus,
} from './payment.models';
import { TopUpSessionStore } from './top-up-session.store';

const POLL_INTERVAL_MS = 2_000;
const MAX_POLLS = 30;

@Injectable({ providedIn: 'root' })
export class PaymentFacade {
  private readonly gateway = inject(PAYMENT_GATEWAY);
  private readonly session = inject(TopUpSessionStore);

  initiateTopUp(request: TopUpInitiateRequest, amountMinor: number): Observable<TopUpInitiateResponse> {
    return this.gateway.initiateTopUp(request).pipe(
      map((response) => {
        this.session.save({
          paymentId: response.paymentId,
          amountMinor,
          initiatedAt: Date.now(),
        });
        return response;
      }),
    );
  }

  getStatus(paymentId: string): Observable<PaymentStatusResponse> {
    return this.gateway.getStatus(paymentId);
  }

  /** Poll until a terminal status or the poll budget is exhausted. */
  pollUntilSettled(paymentId: string): Observable<PaymentStatusResponse> {
    return this.getStatus(paymentId).pipe(
      expand((status, index) => {
        if (isTerminalPaymentStatus(status.status) || index >= MAX_POLLS - 1) {
          return EMPTY;
        }
        return timer(POLL_INTERVAL_MS).pipe(switchMap(() => this.getStatus(paymentId)));
      }),
      take(MAX_POLLS),
    );
  }

  readSession(): ReturnType<TopUpSessionStore['read']> {
    return this.session.read();
  }

  clearSession(): void {
    this.session.clear();
  }

  isStillPending(status: PaymentStatusResponse): boolean {
    return isPendingPaymentStatus(status.status);
  }
}
