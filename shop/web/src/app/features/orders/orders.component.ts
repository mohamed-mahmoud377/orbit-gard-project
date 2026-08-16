import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { Order } from '../../core/models';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { IconComponent } from '../../shared/icon.component';
import { MoneyPipe } from '../../shared/money.pipe';
import { SkeletonComponent } from '../../shared/skeleton.component';
import { orderStatusStyle, paymentStatusStyle } from './order-status';

@Component({
  selector: 'ob-orders',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DatePipe, EmptyStateComponent, IconComponent, MoneyPipe, SkeletonComponent],
  host: { class: 'block' },
  template: `
    <div class="ob-container py-6">
      <h1 class="mb-5 text-2xl font-extrabold tracking-tight">Your orders</h1>

      @if (loading()) {
        <div class="space-y-4">
          @for (i of [0, 1, 2]; track i) {
            <div class="ob-panel p-5">
              <ob-skeleton variant="lines" [count]="3" />
            </div>
          }
        </div>
      } @else if (orders().length === 0) {
        <div class="ob-panel">
          <ob-empty-state
            art="package"
            title="No orders yet"
            message="When you place an order it will show up here, with tracking and receipts."
          >
            <a routerLink="/" class="ob-btn ob-btn-primary">Start shopping</a>
          </ob-empty-state>
        </div>
      } @else {
        <ul class="space-y-4">
          @for (order of orders(); track order.id) {
            <li class="ob-panel overflow-hidden">
              <div
                class="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-line bg-line-soft px-5 py-3 text-xs"
              >
                <div>
                  <p class="font-bold tracking-wider text-muted uppercase">Order placed</p>
                  <p class="mt-0.5 font-semibold">{{ order.placedAt | date: 'd MMM y' }}</p>
                </div>
                <div>
                  <p class="font-bold tracking-wider text-muted uppercase">Total</p>
                  <p class="mt-0.5 font-semibold">{{ order.totalCents | money }}</p>
                </div>
                <div>
                  <p class="font-bold tracking-wider text-muted uppercase">Ship to</p>
                  <p class="mt-0.5 font-semibold">{{ order.shippingAddress.fullName }}</p>
                </div>
                <div class="sm:ml-auto sm:text-right">
                  <p class="font-bold tracking-wider text-muted uppercase">Order</p>
                  <p class="mt-0.5 font-mono font-semibold">{{ order.orderNumber }}</p>
                </div>
              </div>

              <div class="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="ob-badge gap-1.5" [class]="statusStyle(order).classes">
                    <ob-icon [name]="statusStyle(order).icon" [size]="12" />
                    {{ statusStyle(order).label }}
                  </span>
                  @if (order.paymentStatus !== 'PAID') {
                    <span class="ob-badge gap-1.5" [class]="paymentStyle(order).classes">
                      <ob-icon [name]="paymentStyle(order).icon" [size]="12" />
                      {{ paymentStyle(order).label }}
                    </span>
                  }
                  <span class="text-xs text-muted"
                    >{{ order.itemCount ?? 0 }}
                    {{ (order.itemCount ?? 0) === 1 ? 'item' : 'items' }}</span
                  >
                </div>

                <div class="flex flex-wrap items-center gap-2">
                  @if (order.paymentStatus === 'UNPAID' && order.status !== 'CANCELLED') {
                    <a
                      [routerLink]="['/checkout']"
                      [queryParams]="{ order: order.id }"
                      class="ob-btn ob-btn-primary ob-btn-sm"
                    >
                      Complete payment
                    </a>
                  }
                  <a [routerLink]="['/orders', order.id]" class="ob-btn ob-btn-ghost ob-btn-sm">
                    View order
                    <ob-icon name="chevron-right" [size]="14" />
                  </a>
                </div>
              </div>

              @if (order.paymentStatus === 'UNCERTAIN') {
                <p
                  class="flex items-start gap-2 border-t border-warn/25 bg-warn-soft px-5 py-3 text-xs leading-relaxed text-warn"
                >
                  <ob-icon name="alert-triangle" [size]="15" class="mt-px shrink-0" />
                  <span>
                    We lost contact with Orbit while this payment was going through. The order is on
                    hold so you aren't charged twice — check your Orbit transactions.
                  </span>
                </p>
              }
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class OrdersComponent {
  private readonly api = inject(ApiService);

  protected readonly orders = signal<Order[]>([]);
  protected readonly loading = signal(true);

  protected readonly statusStyle = (order: Order) => orderStatusStyle(order.status);
  protected readonly paymentStyle = (order: Order) => paymentStatusStyle(order.paymentStatus);

  constructor() {
    this.api.orders().subscribe({
      next: (res) => {
        this.orders.set(res.items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
