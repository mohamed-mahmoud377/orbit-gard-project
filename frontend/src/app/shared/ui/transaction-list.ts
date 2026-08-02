import { Component, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { formatMoney } from '../utils/money';

export interface TransactionListItem {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly amount: number;
  readonly status: string;
  readonly createdAt: string;
}

@Component({
  selector: 'app-transaction-list',
  imports: [DatePipe],
  template: `
    <div class="transaction-list">
      @for (transaction of transactions(); track transaction.id) {
        <button class="transaction-row" type="button" (click)="selected.emit(transaction.id)">
          <span class="transaction-icon" [attr.data-kind]="transaction.amount > 0 ? 'credit' : 'debit'">
            {{ transaction.amount > 0 ? '+' : '−' }}
          </span>
          <span class="transaction-copy">
            <strong>{{ transaction.title }}</strong>
            <small>{{ transaction.subtitle }}</small>
          </span>
          <span class="transaction-meta">
            <strong
              class="amount"
              [class.amount-positive]="transaction.amount > 0"
              [class.muted]="transaction.status === 'REJECTED'"
            >
              {{ transaction.amount > 0 ? '+' : '−' }}
              {{ money(absolute(transaction.amount)) }}
            </strong>
            <span class="pill" [class]="'pill pill-' + transaction.status.toLowerCase()">
              {{ transaction.status }}
            </span>
          </span>
          @if (showDate()) {
            <time [dateTime]="transaction.createdAt">
              {{ transaction.createdAt | date: 'mediumDate' }}
            </time>
          }
        </button>
      } @empty {
        <div class="empty-state">
          <strong>No activity yet</strong>
          <span>Wallet activity will appear here.</span>
        </div>
      }
    </div>
  `,
  styleUrl: './transaction-list.scss',
})
export class TransactionList {
  readonly transactions = input.required<readonly TransactionListItem[]>();
  readonly showDate = input(false);
  readonly selected = output<string>();

  protected readonly money = formatMoney;
  protected readonly absolute = Math.abs;
}
