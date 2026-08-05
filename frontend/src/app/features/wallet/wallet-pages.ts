import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AssetUrlPipe } from '../../core/asset-url';
import { DemoStore } from '../../data-access';
import { Transaction, User } from '../../shared/models';
import { PageHeader } from '../../shared/ui/page-header';
import { StatusView } from '../../shared/ui/status-view';
import { TransactionList, TransactionListItem } from '../../shared/ui/transaction-list';
import { formatMoney, parseMoney } from '../../shared/utils/money';
import {
  PaymentApiError,
  PaymentFacade,
  PAYMENT_MESSAGES,
  bannerMessageFromPaymentError,
} from './data-access';

function signedAmount(transaction: Transaction): number {
  return transaction.type === 'top-up' || transaction.type === 'transfer-in'
    ? transaction.amountMinor
    : -transaction.amountMinor;
}

function listItem(transaction: Transaction): TransactionListItem {
  return {
    id: transaction.id,
    title: transaction.title,
    subtitle: transaction.subtitle,
    amount: signedAmount(transaction),
    status: transaction.status.toUpperCase(),
    createdAt: transaction.occurredAt,
  };
}

@Component({
  selector: 'app-dashboard-page',
  imports: [RouterLink, PageHeader, TransactionList, AssetUrlPipe],
  template: `
    <section class="page stack" data-node-id="3:2">
      <app-page-header
        [title]="'Good evening, ' + (store.currentUser()?.fullName?.split(' ')?.[0] ?? 'Mohamed')"
        subtitle="Saturday, 25 July 2026"
      >
        <img [src]="'assets/notifications.svg' | assetUrl" width="40" height="40" alt="Notifications" />
      </app-page-header>

      <div class="balance-card">
        <div>
          <span class="overline">Available to spend</span>
          <h2 class="amount">{{ money(store.wallet()?.availableMinor ?? 0) }}</h2>
          <div class="balance-stats">
            <div>
              <span>Total balance</span>
              <strong class="amount">{{ money(store.wallet()?.totalMinor ?? 0) }}</strong>
            </div>
            <div>
              <span>Held / pending</span>
              <strong class="amount" style="color: var(--held)">
                {{ money(store.wallet()?.heldMinor ?? 0) }}
              </strong>
            </div>
          </div>
        </div>
        <img class="balance-graphic" [src]="'assets/orbit-graphic.svg' | assetUrl" alt="" aria-hidden="true" />
      </div>

      <div class="quick-actions">
        <a class="btn btn-primary" routerLink="/top-up">● Top up wallet</a>
        <a class="btn btn-secondary" routerLink="/send">● Send money</a>
        <a class="btn btn-outline" routerLink="/family/add">● Add a child</a>
      </div>

      @if ((store.wallet()?.heldMinor ?? 0) > 0) {
        <div class="notice notice-held">
          <span aria-hidden="true">●</span>
          <span>
            {{ money(store.wallet()?.heldMinor ?? 0) }} is held for pending payments. These settle
            automatically — no action is needed from you.
          </span>
        </div>
      }

      <section class="card activity-card">
        <header class="activity-header">
          <h2>Recent activity</h2>
          <a routerLink="/transactions">View all</a>
        </header>
        <app-transaction-list
          [transactions]="recent()"
          (selected)="openTransaction($event)"
        />
      </section>
    </section>
  `,
  styleUrl: './wallet-pages.scss',
})
export default class DashboardPage {
  protected readonly store = inject(DemoStore);
  private readonly router = inject(Router);
  protected readonly money = formatMoney;
  protected readonly recent = computed(() => this.store.recentActivity().slice(0, 8).map(listItem));

  protected openTransaction(id: string): void {
    void this.router.navigate(['/transactions', id]);
  }
}

type TopUpStage = 'form' | 'redirecting';

@Component({
  selector: 'app-top-up-page',
  imports: [DecimalPipe, FormsModule, PageHeader, StatusView],
  template: `
    <section class="page stack" data-node-id="11:2">
      <app-page-header
        title="Top up your wallet"
        subtitle="Add money through Paymob. The exact amount you pay lands in your wallet."
      />

      @switch (stage()) {
        @case ('redirecting') {
          <div style="display:grid;place-items:center" data-node-id="14:2">
            <app-status-view
              title="Redirecting to Paymob"
              [message]="PAYMENT_MESSAGES.redirecting"
              tone="pending"
            />
          </div>
        }
        @default {
          <div class="feature-grid">
            <article class="card panel amount-entry">
              <div>
                <h2>How much would you like to add?</h2>
                <p class="muted">Minimum EGP 50.00 · Maximum EGP 20,000.00</p>
              </div>
              <div class="amount-input-wrap">
                <span>EGP</span>
                <input
                  class="input amount-input"
                  [ngModel]="amount()"
                  (ngModelChange)="amount.set($event)"
                  inputmode="decimal"
                  aria-label="Top-up amount"
                  [disabled]="submitting()"
                />
              </div>
              <div class="amount-chips" aria-label="Quick amounts">
                @for (quick of quickAmounts; track quick) {
                  <button
                    class="chip"
                    [class.active]="amountMinor() === quick * 100"
                    type="button"
                    [disabled]="submitting()"
                    (click)="amount.set(quick.toString())"
                  >
                    {{ quick | number }}
                  </button>
                }
              </div>
              <div class="summary-list">
                <div class="summary-row"><span>You pay</span><strong>{{ money(amountMinor()) }}</strong></div>
                <div class="summary-row"><span>Orbit fee</span><strong>EGP 0.00</strong></div>
                <div class="summary-row">
                  <strong>Lands in your wallet</strong><strong>{{ money(amountMinor()) }}</strong>
                </div>
              </div>
              @if (error()) {
                <div class="notice notice-danger" role="alert">{{ error() }}</div>
              }
              <button
                class="btn btn-primary"
                type="button"
                [disabled]="submitting()"
                (click)="continueToPaymob()"
              >
                {{ submitting() ? 'Starting…' : 'Continue to Paymob' }}
              </button>
            </article>
            <aside class="card panel stack">
              <h2>How it works</h2>
              <ol class="how-list">
                <li><span class="step">1</span><div><strong>You are sent to Paymob</strong><p class="muted">A secure checkout opens in your browser.</p></div></li>
                <li><span class="step">2</span><div><strong>You pay by card or wallet</strong><p class="muted">Complete payment on Paymob's page.</p></div></li>
                <li><span class="step">3</span><div><strong>Orbit confirms your payment</strong><p class="muted">You return here while we verify the result.</p></div></li>
              </ol>
            </aside>
          </div>
        }
      }
    </section>
  `,
  styleUrl: './wallet-pages.scss',
})
export class TopUpPage {
  private readonly payments = inject(PaymentFacade);
  protected readonly stage = signal<TopUpStage>('form');
  protected readonly submitting = signal(false);
  protected readonly error = signal('');
  protected readonly quickAmounts = [100, 250, 500, 1000, 2000] as const;
  protected readonly money = formatMoney;
  protected readonly amount = signal('500');
  protected readonly amountMinor = computed(() => parseMoney(this.amount()));
  protected readonly PAYMENT_MESSAGES = PAYMENT_MESSAGES;

  protected continueToPaymob(): void {
    const amountMinor = this.amountMinor();
    if (amountMinor < 5000 || amountMinor > 2_000_000) {
      this.error.set(PAYMENT_MESSAGES.amountBelowMinimum);
      return;
    }

    this.error.set('');
    this.submitting.set(true);

    const amountMajor = Math.round(amountMinor) / 100;
    this.payments.initiateTopUp({ amount: amountMajor }, amountMinor).subscribe({
      next: (response) => {
        this.submitting.set(false);
        this.stage.set('redirecting');
        window.location.assign(response.redirectUrl);
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.error.set(
          err instanceof PaymentApiError
            ? bannerMessageFromPaymentError(err)
            : PAYMENT_MESSAGES.networkError,
        );
      },
    });
  }
}

@Component({
  selector: 'app-transactions-page',
  imports: [FormsModule, PageHeader, TransactionList],
  template: `
    <section class="page stack" data-node-id="28:2">
      <app-page-header
        title="Transactions"
        subtitle="Every movement in and out of your wallet. Nothing here is ever edited or deleted."
      />
      <div class="stats-grid">
        <article class="card stat-card"><span>Money in this month</span><strong class="amount amount-positive">+ EGP 1,500.00</strong></article>
        <article class="card stat-card"><span>Money out this month</span><strong class="amount">− EGP 715.00</strong></article>
        <article class="card stat-card"><span>Currently held</span><strong class="amount" style="color:var(--held)">{{ money(store.wallet()?.heldMinor ?? 0) }}</strong></article>
        <article class="card stat-card"><span>Rejected or expired</span><strong>2 payments</strong></article>
      </div>
      <div class="toolbar">
        <input
          class="input"
          [ngModel]="search()"
          (ngModelChange)="search.set($event)"
          placeholder="Search by merchant, username or reference"
          aria-label="Search transactions"
        />
        <div class="filters">
          @for (option of filters; track option) {
            <button class="chip" [class.active]="filter() === option" type="button" (click)="filter.set(option)">
              {{ option }}
            </button>
          }
        </div>
      </div>
      <section class="card panel">
        <app-transaction-list [transactions]="filtered()" [showDate]="true" (selected)="open($event)" />
      </section>
      <p class="muted">Showing {{ filtered().length }} of 42 transactions</p>
    </section>
  `,
  styleUrl: './wallet-pages.scss',
})
export class TransactionsPage {
  protected readonly store = inject(DemoStore);
  private readonly router = inject(Router);
  protected readonly money = formatMoney;
  protected readonly filters = ['All', 'Pending', 'Completed', 'Rejected', 'Expired'] as const;
  protected readonly filter = signal<(typeof this.filters)[number]>('All');
  protected readonly search = signal('');
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.filter().toLowerCase();
    return this.store
      .recentActivity()
      .filter((transaction) => {
        const matchesTerm =
          !term ||
          transaction.title.toLowerCase().includes(term) ||
          transaction.subtitle.toLowerCase().includes(term);
        const matchesStatus = status === 'all' || transaction.status === status;
        return matchesTerm && matchesStatus;
      })
      .map(listItem);
  });

  protected open(id: string): void {
    void this.router.navigate(['/transactions', id]);
  }
}

@Component({
  selector: 'app-transaction-detail-page',
  imports: [RouterLink, PageHeader],
  template: `
    <section class="page stack" data-node-id="29:2">
      <app-page-header title="Transaction details" subtitle="Settlement and wallet movement history." />
      @if (transaction(); as item) {
        <article class="card panel stack">
          <div class="detail-grid">
            <div><p class="overline">Payee</p><h2>{{ item.title }}</h2><p class="muted">{{ item.subtitle }}</p></div>
            <div><p class="overline">Amount</p><h2 class="amount">{{ item.type === 'top-up' ? '+' : '−' }} {{ money(item.amountMinor) }}</h2></div>
            <div><p class="overline">Reference</p><strong>{{ item.id }}</strong></div>
            <div><p class="overline">Status</p><span class="pill" [class]="'pill pill-' + item.status">{{ item.status.toUpperCase() }}</span></div>
          </div>
          @if (item.status === 'pending') {
            <div class="notice notice-held">Funds are held while Orbit waits for the next settlement cycle.</div>
          }
        </article>
      } @else {
        <div class="notice notice-danger">Transaction not found.</div>
      }
      <a class="btn btn-secondary" style="width:max-content" routerLink="/transactions">Back to transactions</a>
    </section>
  `,
  styleUrl: './wallet-pages.scss',
})
export class TransactionDetailPage {
  private readonly store = inject(DemoStore);
  private readonly route = inject(ActivatedRoute);
  protected readonly money = formatMoney;
  protected readonly transaction = computed(() =>
    this.store.transactions().find((item) => item.id === this.route.snapshot.paramMap.get('id')),
  );
}

@Component({
  selector: 'app-send-money-page',
  imports: [FormsModule, PageHeader, StatusView],
  template: `
    <section class="page stack" data-node-id="13:2">
      <app-page-header
        title="Send money"
        subtitle="Transfer instantly to another Orbit user by their username."
      />
      @if (sent()) {
        <div style="display:grid;place-items:center">
          <app-status-view
            title="Money sent"
            [message]="money(amountMinor()) + ' was sent to @' + recipient()?.username + '.'"
            tone="success"
            actionLabel="Send another transfer"
            (action)="reset()"
          />
        </div>
      } @else {
        <div class="feature-grid narrow-aside">
          <article class="card panel stack">
            <div class="field">
              <label for="recipient">Send to</label>
              <input
                class="input"
                id="recipient"
                [(ngModel)]="username"
                (blur)="findRecipient()"
                placeholder="@username"
              />
            </div>
            @if (recipient(); as person) {
              <div class="recipient">
                <span class="avatar">{{ initials(person) }}</span>
                <div><strong>{{ person.fullName }}</strong><small>&#64;{{ person.username }}</small></div>
                <span class="pill pill-completed">VERIFIED</span>
              </div>
              <div class="notice notice-held">Check this is the right person — transfers cannot be reversed.</div>
            }
            <div class="field">
              <label for="send-amount">Amount</label>
              <div class="amount-input-wrap">
                <span>EGP</span>
                <input class="input amount-input" id="send-amount" [(ngModel)]="amount" inputmode="decimal" />
              </div>
              <small class="muted">Available {{ money(store.wallet()?.availableMinor ?? 0) }}</small>
            </div>
            <div class="field">
              <label for="note">Note <span class="muted">Optional</span></label>
              <input class="input" id="note" [(ngModel)]="note" placeholder="Thanks for lunch" />
            </div>
            @if (error()) {
              <div class="notice notice-danger" role="alert">{{ error() }}</div>
            }
            <button class="btn btn-primary" type="button" [disabled]="!recipient()" (click)="send()">
              Send {{ money(amountMinor()) }} to &#64;{{ recipient()?.username ?? 'recipient' }}
            </button>
          </article>
          <aside class="card panel wallet-breakdown">
            <h2>What you can send</h2>
            <div class="summary-row"><span>Total balance</span><strong>{{ money(store.wallet()?.totalMinor ?? 0) }}</strong></div>
            <div class="summary-row"><span>Held</span><strong style="color:var(--held)">− {{ money(store.wallet()?.heldMinor ?? 0) }}</strong></div>
            <p class="muted">2 pending payments awaiting settlement</p>
            <div class="summary-row"><strong>Available to send</strong><strong>{{ money(store.wallet()?.availableMinor ?? 0) }}</strong></div>
          </aside>
        </div>
      }
    </section>
  `,
  styleUrl: './wallet-pages.scss',
})
export class SendMoneyPage {
  protected readonly store = inject(DemoStore);
  protected readonly recipient = signal<User | null>(null);
  protected readonly error = signal('');
  protected readonly sent = signal(false);
  protected readonly money = formatMoney;
  protected username = 'sara';
  protected amount = '200';
  protected note = 'Thanks for lunch';
  protected amountMinor = computed(() => parseMoney(this.amount));

  constructor() {
    this.findRecipient();
  }

  protected findRecipient(): void {
    const result = this.store.lookupRecipient(this.username);
    this.recipient.set(result.ok ? result.value : null);
    this.error.set(result.ok ? '' : result.message);
  }

  protected send(): void {
    const recipient = this.recipient();
    if (!recipient) return;
    const result = this.store.transfer({
      recipientUserId: recipient.id,
      amountMinor: this.amountMinor(),
      note: this.note,
    });
    if (!result.ok) {
      this.error.set(
        result.error === 'INSUFFICIENT_FUNDS'
          ? `INSUFFICIENT_AVAILABLE · ${result.message}`
          : result.message,
      );
      return;
    }
    this.sent.set(true);
  }

  protected reset(): void {
    this.sent.set(false);
    this.error.set('');
    this.amount = '200';
  }

  protected initials(user: User): string {
    return user.fullName
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2);
  }
}
