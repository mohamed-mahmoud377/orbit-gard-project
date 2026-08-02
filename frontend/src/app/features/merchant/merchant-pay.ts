import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DemoStore } from '../../data-access';
import { StatusView } from '../../shared/ui/status-view';
import { OrbitLogo } from '../../shared/ui/orbit-logo';
import { formatMoney } from '../../shared/utils/money';

type MerchantStage = 'product' | 'checkout' | 'pending' | 'settled' | 'rejected';

@Component({
  selector: 'app-merchant-pay-page',
  imports: [OrbitLogo, StatusView, RouterLink],
  template: `
    <main class="merchant-page">
      <header class="store-bar">
        <app-orbit-logo [compact]="true" />
        <div><strong>Nile Books</strong><span>Demonstration store · integrates Orbit /pay</span></div>
      </header>

      @if (stage() === 'product') {
        <section class="product card" data-node-id="32:2">
          <div class="book" aria-hidden="true">NB</div>
          <p class="overline">Nile Books</p>
          <h1>{{ product().name }}</h1>
          <p class="muted">{{ product().description }}</p>
          <strong class="product-price">{{ money(product().priceMinor) }}</strong>
          <button class="btn btn-primary" type="button" (click)="stage.set('checkout')">Pay with Orbit</button>
        </section>
      } @else if (stage() === 'checkout') {
        <section class="payment-card card" data-node-id="32:19">
          <h1>Pay with Orbit</h1>
          <p class="muted">Enter the Orbit username to charge.</p>
          <div class="field">
            <label for="merchant-username">Orbit username</label>
            <div class="found-input">
              <span>&#64;</span>
              <input id="merchant-username" value="mohamed" readonly />
              <span class="pill pill-completed">FOUND</span>
            </div>
          </div>
          <div class="order-summary">
            <div><span>Order</span><strong>#4821</strong></div>
            <div><span>Item</span><strong>{{ product().name }}</strong></div>
            <div><span>Amount</span><strong>{{ money(product().priceMinor) }}</strong></div>
            <div class="charge"><strong>Charge to &#64;mohamed</strong><strong>{{ money(product().priceMinor) }}</strong></div>
          </div>
          @if (!store.isAuthenticated()) {
            <div class="notice notice-info">
              Sign in to Orbit before confirming this payment.
              <a class="text-link" routerLink="/auth/login">Sign in</a>
            </div>
          }
          @if (error()) { <div class="notice notice-danger">{{ error() }}</div> }
          <button
            class="btn btn-primary"
            type="button"
            [disabled]="!store.isAuthenticated()"
            (click)="confirm()"
          >
            Confirm payment
          </button>
          <div class="notice notice-held">
            This demonstration identifies the payer by username alone. Production would require a
            signed payment token or redirect-based consent.
          </div>
        </section>
      } @else if (stage() === 'pending') {
        <section class="status-wrap" data-node-id="32:53">
          <app-status-view
            title="Payment accepted"
            message="202 Accepted · Funds are held while the next settlement rule runs."
            tone="pending"
          />
          <div class="actions">
            <button class="btn btn-primary" type="button" (click)="resolve(true)">Settle demo payment</button>
            <button class="btn btn-secondary" type="button" (click)="resolve(false)">Reject by settlement rule</button>
          </div>
        </section>
      } @else if (stage() === 'settled') {
        <section class="status-wrap" data-node-id="32:82">
          <app-status-view
            title="Payment completed"
            [message]="money(product().priceMinor) + ' was settled to Nile Books.'"
            tone="success"
            actionLabel="Return to product"
            (action)="restart()"
          />
        </section>
      } @else {
        <section class="status-wrap" data-node-id="32:112">
          <app-status-view
            title="Payment rejected"
            message="Settlement rule 1 rejected the payment. The hold was released back to the wallet."
            tone="danger"
            actionLabel="Try again"
            (action)="stage.set('checkout')"
          />
        </section>
      }
    </main>
  `,
  styleUrl: './merchant-pay.scss',
})
export default class MerchantPayPage {
  protected readonly store = inject(DemoStore);
  protected readonly stage = signal<MerchantStage>('product');
  protected readonly error = signal('');
  protected readonly money = formatMoney;
  protected readonly product = computed(() => this.store.merchantProducts()[0]!);
  private paymentId = '';

  protected confirm(): void {
    if (!this.store.isAuthenticated()) {
      this.error.set('Sign in to Orbit before confirming this payment.');
      return;
    }
    const product = this.product();
    const result = this.store.startMerchantPayment(product.id);
    if (!result.ok) {
      this.error.set(result.message);
      return;
    }
    this.paymentId = result.value.payment.id;
    this.stage.set('pending');
  }

  protected resolve(settle: boolean): void {
    const result = settle
      ? this.store.settleMerchantPayment(this.paymentId)
      : this.store.rejectMerchantPayment(this.paymentId, 'Settlement rule 1');
    if (!result.ok) {
      this.error.set(result.message);
      return;
    }
    this.stage.set(settle ? 'settled' : 'rejected');
  }

  protected restart(): void {
    this.paymentId = '';
    this.stage.set('product');
  }
}
