import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, map, of, switchMap, tap } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { Order } from '../../core/models';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { IconComponent } from '../../shared/icon.component';
import { ImgFallbackDirective, placeholderDataUri } from '../../shared/img-fallback.directive';
import { MoneyPipe } from '../../shared/money.pipe';
import { TRACK_STAGES, orderStatusStyle, paymentStatusStyle } from './order-status';

@Component({
  selector: 'ob-order-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    DatePipe,
    EmptyStateComponent,
    IconComponent,
    ImgFallbackDirective,
    MoneyPipe,
  ],
  host: { class: 'block' },
  template: `
    <div class="ob-container py-6">
      <a routerLink="/orders" class="mb-4 inline-flex items-center gap-1.5 text-sm text-brand hover:underline">
        <ob-icon name="arrow-left" [size]="15" /> All orders
      </a>

      @if (loading()) {
        <div class="space-y-4">
          <div class="ob-skeleton h-28 rounded-2xl"></div>
          <div class="ob-skeleton h-64 rounded-2xl"></div>
        </div>
      } @else if (order(); as o) {
        <!-- ======================================================= head -->
        <header class="ob-panel mb-5 p-5">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p class="text-xs font-bold tracking-wider text-muted uppercase">Order</p>
              <h1 class="font-mono text-xl font-extrabold tracking-tight">{{ o.orderNumber }}</h1>
              <p class="mt-1 text-sm text-muted">
                Placed {{ o.placedAt | date: 'd MMMM y, HH:mm' }}
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <span class="ob-badge gap-1.5" [class]="statusStyle().classes">
                <ob-icon [name]="statusStyle().icon" [size]="12" />
                {{ statusStyle().label }}
              </span>
              <span class="ob-badge gap-1.5" [class]="paymentStyle().classes">
                <ob-icon [name]="paymentStyle().icon" [size]="12" />
                {{ paymentStyle().label }}
              </span>
            </div>
          </div>

          <!-- The uncertain path (CONTRACT §8): amber, never red, and no retry. -->
          @if (o.paymentStatus === 'UNCERTAIN') {
            <div
              class="mt-4 flex items-start gap-3 rounded-xl border border-warn/30 bg-warn-soft p-4"
              role="status"
            >
              <ob-icon name="alert-triangle" [size]="20" class="mt-0.5 shrink-0 text-warn" />
              <div class="text-sm">
                <p class="font-bold text-warn">This payment is still being confirmed</p>
                <p class="mt-1 leading-relaxed text-warn/90">
                  We lost contact with Orbit while your payment was going through, so we can't tell
                  yet whether your wallet was debited. The order is on hold so you aren't charged
                  twice. Please check your Orbit transactions — if the payment went through, this
                  order will complete on its own.
                </p>
              </div>
            </div>
          } @else if (o.paymentStatus === 'UNPAID' && o.status !== 'CANCELLED') {
            <div class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-accent-soft p-4">
              <p class="text-sm font-semibold text-accent-dark">
                This order hasn't been paid for yet.
              </p>
              <a
                routerLink="/checkout"
                [queryParams]="{ order: o.id }"
                class="ob-btn ob-btn-primary ob-btn-sm"
                >Complete payment</a
              >
            </div>
          }

          <!-- tracker -->
          @if (showTracker()) {
            <ol class="mt-6 flex items-center">
              @for (stage of stages; track stage.status; let i = $index; let last = $last) {
                <li class="flex flex-1 items-center" [class.flex-none]="last">
                  <div class="flex flex-col items-center gap-1.5">
                    <span
                      class="grid size-9 place-items-center rounded-full border-2 transition"
                      [class]="
                        i <= stageIndex()
                          ? 'border-teal bg-teal text-white'
                          : 'border-line bg-surface text-muted'
                      "
                    >
                      <ob-icon [name]="stage.icon" [size]="16" />
                    </span>
                    <span
                      class="text-center text-[10px] font-bold"
                      [class]="i <= stageIndex() ? 'text-teal' : 'text-muted'"
                      >{{ stage.label }}</span
                    >
                  </div>
                  @if (!last) {
                    <span
                      class="mx-1 -mt-5 h-0.5 flex-1 rounded"
                      [class]="i < stageIndex() ? 'bg-teal' : 'bg-line'"
                    ></span>
                  }
                </li>
              }
            </ol>
          }
        </header>

        <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <!-- ==================================================== items -->
          <div class="ob-panel divide-y divide-line">
            <h2 class="px-5 py-3 text-sm font-bold">
              {{ o.items?.length ?? 0 }} {{ (o.items?.length ?? 0) === 1 ? 'product' : 'products' }}
            </h2>
            @for (item of o.items ?? []; track item.id) {
              <article class="flex gap-4 p-4">
                <a
                  [routerLink]="['/p', item.slug]"
                  class="ob-media size-20 shrink-0 rounded-xl border border-line"
                >
                  <img [src]="itemImage(item.image, item.name)" [alt]="item.name" [obImgFallback]="item.name" />
                </a>
                <div class="min-w-0 flex-1">
                  <h3 class="text-sm font-semibold">
                    <a [routerLink]="['/p', item.slug]" class="ob-clamp-2 hover:text-brand">{{
                      item.name
                    }}</a>
                  </h3>
                  <p class="mt-1 text-xs text-muted">
                    {{ item.unitPriceCents | money }} × {{ item.qty }}
                  </p>
                  <a
                    [routerLink]="['/p', item.slug]"
                    class="mt-2 inline-block text-xs font-bold text-brand hover:underline"
                    >Buy it again</a
                  >
                </div>
                <p class="shrink-0 text-sm font-bold">{{ item.lineTotalCents | money }}</p>
              </article>
            }
          </div>

          <!-- ================================================== summary -->
          <aside class="space-y-5">
            <div class="ob-panel p-5">
              <h2 class="text-sm font-bold">Payment summary</h2>
              <dl class="mt-3 space-y-2 text-sm">
                <div class="flex justify-between">
                  <dt class="text-muted">Subtotal</dt>
                  <dd class="font-semibold">{{ o.subtotalCents | money }}</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-muted">Delivery ({{ o.shippingMethod }})</dt>
                  <dd class="font-semibold">
                    @if (o.shippingCents === 0) {
                      <span class="text-teal">Free</span>
                    } @else {
                      {{ o.shippingCents | money }}
                    }
                  </dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-muted">VAT (14%)</dt>
                  <dd class="font-semibold">{{ o.taxCents | money }}</dd>
                </div>
                @if (o.discountCents > 0) {
                  <div class="flex justify-between text-pop">
                    <dt>Discount</dt>
                    <dd class="font-semibold">−{{ o.discountCents | money }}</dd>
                  </div>
                }
                <div class="flex justify-between border-t border-line pt-2 text-base">
                  <dt class="font-bold">Total</dt>
                  <dd class="font-extrabold">{{ o.totalCents | money }}</dd>
                </div>
              </dl>

              @if (o.payment; as payment) {
                <div class="mt-4 space-y-1.5 border-t border-line pt-4 text-xs">
                  <p class="flex items-center gap-2 font-bold">
                    <ob-icon
                      [name]="payment.method === 'ORBIT_WALLET' ? 'wallet' : 'credit-card'"
                      [size]="14"
                      class="text-brand"
                    />
                    {{ payment.method === 'ORBIT_WALLET' ? 'Orbit E-Wallet' : 'Card' }}
                  </p>
                  @if (payment.cardBrand) {
                    <p class="text-muted">{{ payment.cardBrand }} ending {{ payment.cardLast4 }}</p>
                  }
                  @if (payment.authCode) {
                    <p class="text-muted">Authorisation {{ payment.authCode }}</p>
                  }
                  @if (payment.orbitReference) {
                    <p class="text-muted">Orbit reference {{ payment.orbitReference }}</p>
                  }
                  @if (payment.orbitTransactionId) {
                    <p class="text-muted">Transaction {{ payment.orbitTransactionId }}</p>
                  }
                  @if (payment.failureMessage && payment.status !== 'APPROVED') {
                    <p class="text-pop">{{ payment.failureMessage }}</p>
                  }
                </div>
              }
            </div>

            <div class="ob-panel p-5">
              <h2 class="text-sm font-bold">Delivery address</h2>
              <address class="mt-3 text-sm leading-relaxed not-italic text-muted">
                <span class="block font-semibold text-body">{{ o.shippingAddress.fullName }}</span>
                {{ o.shippingAddress.line1 }}<br />
                @if (o.shippingAddress.line2) {
                  {{ o.shippingAddress.line2 }}<br />
                }
                {{ o.shippingAddress.city }}, {{ o.shippingAddress.governorate }}
                @if (o.shippingAddress.postalCode) {
                  {{ o.shippingAddress.postalCode }}
                }
                <br />
                {{ o.shippingAddress.phone }}
              </address>
            </div>
          </aside>
        </div>
      } @else {
        <ob-empty-state
          art="package"
          title="We couldn't find that order"
          message="It may belong to another account, or the link may be wrong."
        >
          <a routerLink="/orders" class="ob-btn ob-btn-brand">Back to your orders</a>
        </ob-empty-state>
      }
    </div>
  `,
})
export class OrderDetailComponent {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);

  protected readonly loading = signal(true);
  protected readonly stages = TRACK_STAGES;

  protected readonly order = toSignal(
    this.route.paramMap.pipe(
      map((params) => params.get('id') ?? ''),
      tap(() => this.loading.set(true)),
      switchMap((id) => this.api.order(id).pipe(catchError(() => of(null)))),
      map((res) => res?.order ?? null),
      tap(() => this.loading.set(false)),
    ),
    { initialValue: null as Order | null },
  );

  protected readonly statusStyle = computed(() =>
    orderStatusStyle(this.order()?.status ?? 'PENDING'),
  );
  protected readonly paymentStyle = computed(() =>
    paymentStatusStyle(this.order()?.paymentStatus ?? 'UNPAID'),
  );

  /** Hidden while unpaid, cancelled, or parked for review — it would mislead. */
  protected readonly showTracker = computed(() => {
    const status = this.order()?.status;
    return !!status && !['PENDING', 'CANCELLED', 'NEEDS_REVIEW'].includes(status);
  });

  protected readonly stageIndex = computed(() =>
    TRACK_STAGES.findIndex((stage) => stage.status === this.order()?.status),
  );

  protected itemImage(image: string | null, name: string): string {
    return image ?? placeholderDataUri(name);
  }
}
