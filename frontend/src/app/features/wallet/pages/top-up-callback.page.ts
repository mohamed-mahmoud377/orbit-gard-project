import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { last } from 'rxjs/operators';

import { loginUrlWithReturn } from '../../../core/navigation/return-url';
import { StatusView } from '../../../shared/ui/status-view';
import { formatMoney } from '../../../shared/utils/money';
import { AuthFacade } from '../../auth/data-access/auth.facade';
import {
  PaymentApiError,
  PaymentFacade,
  PAYMENT_MESSAGES,
  bannerMessageFromPaymentError,
  isPendingPaymentStatus,
} from '../data-access';

type CallbackState =
  | 'loading'
  | 'confirming'
  | 'success'
  | 'failed'
  | 'expired'
  | 'still-confirming'
  | 'invalid'
  | 'network';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Component({
  selector: 'app-top-up-callback-page',
  imports: [StatusView],
  template: `
    <section class="page stack callback-page">
      @switch (state()) {
        @case ('loading') {
          <app-status-view
            title="Confirming your top-up"
            message="Please wait while we verify your payment with Orbit."
            tone="pending"
          />
        }
        @case ('confirming') {
          <app-status-view
            [title]="PAYMENT_MESSAGES.confirmingTitle"
            [message]="confirmingMessage()"
            tone="pending"
          />
        }
        @case ('success') {
          <app-status-view
            [title]="PAYMENT_MESSAGES.successTitle"
            [message]="successMessage()"
            tone="success"
            actionLabel="Back to dashboard"
            (action)="goDashboard()"
          />
          @if (paymentId()) {
            <p class="muted reference">Reference · {{ paymentId() }}</p>
          }
        }
        @case ('failed') {
          <app-status-view
            [title]="PAYMENT_MESSAGES.failedTitle"
            [message]="PAYMENT_MESSAGES.failedMessage"
            tone="danger"
            actionLabel="Try again"
            (action)="goTopUp()"
          />
        }
        @case ('expired') {
          <app-status-view
            [title]="PAYMENT_MESSAGES.expiredTitle"
            [message]="PAYMENT_MESSAGES.expiredMessage"
            tone="danger"
            actionLabel="Start a new top-up"
            (action)="goTopUp()"
          />
        }
        @case ('still-confirming') {
          <app-status-view
            [title]="PAYMENT_MESSAGES.stillConfirmingTitle"
            [message]="PAYMENT_MESSAGES.stillConfirmingMessage"
            tone="info"
            actionLabel="Back to dashboard"
            (action)="goDashboard()"
          />
        }
        @case ('invalid') {
          <app-status-view
            [title]="PAYMENT_MESSAGES.invalidReferenceTitle"
            [message]="PAYMENT_MESSAGES.invalidReferenceMessage"
            tone="danger"
            actionLabel="Top up wallet"
            (action)="goTopUp()"
          />
        }
        @default {
          <app-status-view
            title="Something went wrong"
            [message]="banner() || PAYMENT_MESSAGES.networkError"
            tone="danger"
            actionLabel="Try again"
            (action)="confirmPayment()"
          />
        }
      }
    </section>
  `,
  styleUrl: '../wallet-pages.scss',
  host: {
    class: 'callback-host',
  },
})
export class TopUpCallbackPage implements OnInit {
  private readonly auth = inject(AuthFacade);
  private readonly payments = inject(PaymentFacade);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly PAYMENT_MESSAGES = PAYMENT_MESSAGES;
  protected readonly state = signal<CallbackState>('loading');
  protected readonly banner = signal('');
  protected readonly paymentId = signal('');
  protected readonly amountMinor = signal(0);

  ngOnInit(): void {
    const merchantOrderId =
      this.route.snapshot.queryParamMap.get('merchant_order_id')?.trim() ?? '';
    const session = this.payments.readSession();
    const paymentId = this.resolvePaymentId(merchantOrderId, session?.paymentId ?? '');

    if (!paymentId || !UUID_PATTERN.test(paymentId)) {
      this.state.set('invalid');
      return;
    }

    this.paymentId.set(paymentId);
    if (session?.paymentId === paymentId) {
      this.amountMinor.set(session.amountMinor);
    } else {
      const amountCents = Number(
        this.route.snapshot.queryParamMap.get('amount_cents') ?? '',
      );
      if (Number.isFinite(amountCents) && amountCents > 0) {
        this.amountMinor.set(amountCents);
      }
    }

    this.ensureSessionThenConfirm();
  }

  private ensureSessionThenConfirm(): void {
    if (this.auth.isAuthenticated()) {
      this.confirmPayment();
      return;
    }

    if (this.auth.canRefresh()) {
      this.state.set('loading');
      this.auth.refreshSession().subscribe({
        next: () => this.confirmPayment(),
        error: () => {
          void this.router.navigateByUrl(loginUrlWithReturn(this.router.url));
        },
      });
      return;
    }

    void this.router.navigateByUrl(loginUrlWithReturn(this.router.url));
  }

  protected confirmingMessage(): string {
    const amount = this.amountMinor();
    return PAYMENT_MESSAGES.confirmingMessage(
      amount > 0 ? formatMoney(amount) : 'wallet',
    );
  }

  protected successMessage(): string {
    const amount = this.amountMinor();
    return PAYMENT_MESSAGES.successMessage(
      amount > 0 ? formatMoney(amount) : 'Your payment',
    );
  }

  protected confirmPayment(): void {
    const paymentId = this.paymentId();
    if (!paymentId) {
      this.state.set('invalid');
      return;
    }

    this.state.set('confirming');
    this.banner.set('');

    this.payments.pollUntilSettled(paymentId).pipe(last()).subscribe({
      next: (response) => {
        this.paymentId.set(response.paymentId);
        if (response.status === 'COMPLETED') {
          this.payments.clearSession();
          this.state.set('success');
          return;
        }
        if (response.status === 'FAILED') {
          this.payments.clearSession();
          this.state.set('failed');
          return;
        }
        if (response.status === 'EXPIRED') {
          this.payments.clearSession();
          this.state.set('expired');
          return;
        }
        if (isPendingPaymentStatus(response.status)) {
          this.state.set('still-confirming');
          return;
        }
        this.state.set('network');
      },
      error: (error: unknown) => {
        if (error instanceof PaymentApiError && error.code === 'PAYMENT_NOT_FOUND') {
          this.state.set('invalid');
          return;
        }
        this.banner.set(
          error instanceof PaymentApiError
            ? bannerMessageFromPaymentError(error)
            : PAYMENT_MESSAGES.networkError,
        );
        this.state.set('network');
      },
    });
  }

  protected goDashboard(): void {
    void this.router.navigateByUrl('/dashboard');
  }

  protected goTopUp(): void {
    void this.router.navigateByUrl('/top-up');
  }

  private resolvePaymentId(merchantOrderId: string, sessionPaymentId: string): string {
    if (merchantOrderId && UUID_PATTERN.test(merchantOrderId)) {
      return merchantOrderId;
    }
    return sessionPaymentId;
  }
}
