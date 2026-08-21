import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, expand, map, switchMap, take, timer } from 'rxjs';

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

  /**
   * @param amountMinor the charge to remember for the callback screen — the
   *        credit plus the fee, since that screen talks about the payment.
   *        Used only as a fallback if the server sent no breakdown.
   */
  initiateTopUp(request: TopUpInitiateRequest, amountMinor: number): Observable<TopUpInitiateResponse> {
    return this.gateway.initiateTopUp(request).pipe(
      map((response) => {
        this.session.save({
          paymentId: response.paymentId,
          // The server's figure wins: it is what Paymob was actually asked
          // for, so the callback screen quotes the same number the card
          // statement will show rather than one the client worked out.
          amountMinor: response.chargeMinor ?? amountMinor,
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
