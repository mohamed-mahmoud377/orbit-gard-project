import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Order, Payment } from '../../core/models';
import { IconComponent } from '../../shared/icon.component';
import { ImgFallbackDirective, placeholderDataUri } from '../../shared/img-fallback.directive';
import { MoneyPipe } from '../../shared/money.pipe';

/** Post-payment receipt: order number, payment reference and the items. */
@Component({
  selector: 'ob-confirmation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DatePipe, IconComponent, ImgFallbackDirective, MoneyPipe],
  host: { class: 'block' },
  template: `
    <div class="ob-container py-8">
      <div class="mx-auto max-w-3xl">
        <!-- ==================================================== hero -->
        <div class="ob-anim-fade-up ob-card overflow-hidden text-center">
          <div class="relative overflow-hidden bg-ink px-6 py-10 text-white">
            <span
              class="absolute -top-20 -left-16 size-56 rounded-full bg-teal opacity-30 blur-3xl"
            ></span>
            <span
              class="absolute -right-16 -bottom-24 size-56 rounded-full bg-brand opacity-30 blur-3xl"
            ></span>

            <span
              class="relative mx-auto grid size-16 place-items-center rounded-full bg-teal text-white"
            >
              <ob-icon name="check" [size]="34" [strokeWidth]="2.6" />
            </span>
            <h1 class="relative mt-4 text-2xl font-extrabold tracking-tight">Payment complete</h1>
            <p class="relative mt-1.5 text-sm text-white/70">
              Thanks — we've started packing your order.
            </p>
          </div>

          <div class="grid gap-px bg-line sm:grid-cols-3">
            <div class="bg-surface px-4 py-4">
              <p class="text-[11px] font-bold tracking-wider text-muted uppercase">Order number</p>
              <p class="mt-1 font-mono text-sm font-extrabold">{{ order().orderNumber }}</p>
            </div>
            <div class="bg-surface px-4 py-4">
              <p class="text-[11px] font-bold tracking-wider text-muted uppercase">Paid</p>
              <p class="mt-1 text-sm font-extrabold">{{ order().totalCents | money }}</p>
            </div>
            <div class="bg-surface px-4 py-4">
              <p class="text-[11px] font-bold tracking-wider text-muted uppercase">
                {{ payment().method === 'ORBIT_WALLET' ? 'Orbit reference' : 'Authorisation' }}
              </p>
              <p class="mt-1 font-mono text-sm font-extrabold">{{ reference() }}</p>
            </div>
          </div>
        </div>

        <!-- ================================================= payment -->
        <div class="ob-panel mt-5 p-5">
          <h2 class="text-sm font-bold">Payment</h2>
          <div class="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span class="flex items-center gap-2 font-semibold">
              <ob-icon
                [name]="payment().method === 'ORBIT_WALLET' ? 'wallet' : 'credit-card'"
                [size]="17"
                class="text-brand"
              />
              @if (payment().method === 'ORBIT_WALLET') {
                Orbit E-Wallet
              } @else {
                {{ payment().cardBrand }} ending {{ payment().cardLast4 }}
              }
            </span>
            <span class="text-muted">{{ payment().createdAt | date: 'd MMM y, HH:mm' }}</span>
            <span class="ob-badge bg-teal-soft text-teal">Approved</span>
          </div>

          @if (payment().orbitTransactionId) {
            <p class="mt-2 text-xs text-muted">
              Orbit transaction ID
              <span class="font-mono font-semibold text-body">{{
                payment().orbitTransactionId
              }}</span>
            </p>
          }
        </div>

        <!-- =================================================== items -->
        <div class="ob-panel mt-5 divide-y divide-line">
          <h2 class="px-5 py-3 text-sm font-bold">
            {{ order().items?.length ?? 0 }} product{{
              (order().items?.length ?? 0) === 1 ? '' : 's'
            }}
            on the way
          </h2>
          @for (item of order().items ?? []; track item.id) {
            <div class="flex gap-4 p-4">
              <a
                [routerLink]="['/p', item.slug]"
                class="ob-media size-16 shrink-0 rounded-xl border border-line"
              >
                <img
                  [src]="itemImage(item.image, item.name)"
                  [alt]="item.name"
                  [obImgFallback]="item.name"
                />
              </a>
              <div class="min-w-0 flex-1">
                <p class="ob-clamp-2 text-sm font-semibold">{{ item.name }}</p>
                <p class="mt-0.5 text-xs text-muted">Quantity {{ item.qty }}</p>
              </div>
              <p class="shrink-0 text-sm font-bold">{{ item.lineTotalCents | money }}</p>
            </div>
          }

          <div class="flex items-start gap-3 p-5">
            <ob-icon name="truck" [size]="18" class="mt-0.5 shrink-0 text-teal" />
            <div class="text-sm">
              <p class="font-semibold">Delivering to {{ order().shippingAddress.fullName }}</p>
              <p class="mt-0.5 text-xs leading-relaxed text-muted">
                {{ order().shippingAddress.line1 }}, {{ order().shippingAddress.city }},
                {{ order().shippingAddress.governorate }} ·
                {{ order().shippingMethod === 'express' ? 'Express' : 'Standard' }} delivery
              </p>
            </div>
          </div>
        </div>

        <div class="mt-6 flex flex-wrap justify-center gap-3">
          <a [routerLink]="['/orders', order().id]" class="ob-btn ob-btn-brand">
            <ob-icon name="package" [size]="16" /> Track this order
          </a>
          <a routerLink="/" class="ob-btn ob-btn-ghost">Continue shopping</a>
        </div>
      </div>
    </div>
  `,
})
export class ConfirmationComponent {
  readonly order = input.required<Order>();
  readonly payment = input.required<Payment>();

  protected reference(): string {
    const payment = this.payment();
    return payment.orbitReference ?? payment.authCode ?? payment.orbitTransactionId ?? '—';
  }

  protected itemImage(image: string | null, name: string): string {
    return image ?? placeholderDataUri(name);
  }
}
