import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { CartService } from '../../core/cart.service';
import { CartLine } from '../../core/models';
import { FREE_SHIPPING_THRESHOLD_CENTS } from '../../core/pricing';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { IconComponent } from '../../shared/icon.component';
import { ImgFallbackDirective } from '../../shared/img-fallback.directive';
import { MoneyPipe } from '../../shared/money.pipe';
import { PriceComponent } from '../../shared/price.component';
import { QtyStepperComponent } from '../../shared/qty-stepper.component';
import { primaryImage, stockLabel } from '../../shared/product-utils';

@Component({
  selector: 'ob-cart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    EmptyStateComponent,
    IconComponent,
    ImgFallbackDirective,
    MoneyPipe,
    PriceComponent,
    QtyStepperComponent,
  ],
  host: { class: 'block' },
  template: `
    <div class="ob-container py-6">
      <h1 class="mb-5 text-2xl font-extrabold tracking-tight">Your cart</h1>

      @if (cart.initialising()) {
        <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div class="space-y-3">
            @for (i of [0, 1, 2]; track i) {
              <div class="ob-skeleton h-32 rounded-2xl"></div>
            }
          </div>
          <div class="ob-skeleton h-96 rounded-2xl"></div>
        </div>
      } @else if (cart.isEmpty()) {
        <div class="ob-panel">
          <ob-empty-state
            art="cart"
            title="Your cart is empty"
            message="Not so much as a crumb in here. Have a look at the deals — they change every day."
          >
            <a routerLink="/" class="ob-btn ob-btn-primary">Start shopping</a>
            <a routerLink="/search" [queryParams]="{ badge: 'DEAL' }" class="ob-btn ob-btn-ghost">
              <ob-icon name="zap" [size]="16" /> Today's deals
            </a>
          </ob-empty-state>
        </div>
      } @else {
        <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <!-- ================================================== lines -->
          <div>
            <!-- free-shipping progress -->
            <div class="ob-panel mb-4 p-4">
              @if (freeShippingRemaining() > 0) {
                <p class="text-sm">
                  Add
                  <span class="font-bold text-brand">{{ freeShippingRemaining() | money }}</span>
                  more to qualify for
                  <span class="font-bold">free delivery</span>.
                </p>
              } @else {
                <p class="flex items-center gap-2 text-sm font-bold text-teal">
                  <ob-icon name="check-circle" [size]="17" />
                  Your order qualifies for free delivery.
                </p>
              }
              <div class="mt-2.5 h-2 overflow-hidden rounded-full bg-line">
                <div
                  class="h-full rounded-full transition-[width] duration-500"
                  [class]="freeShippingRemaining() > 0 ? 'bg-accent' : 'bg-teal'"
                  [style.width.%]="freeShippingProgress()"
                ></div>
              </div>
            </div>

            <div class="ob-panel divide-y divide-line">
              <div class="flex items-center justify-between px-4 py-3">
                <p class="text-sm font-bold">
                  {{ cart.cart().items.length }}
                  {{ cart.cart().items.length === 1 ? 'product' : 'products' }} ·
                  {{ cart.itemCount() }} {{ cart.itemCount() === 1 ? 'item' : 'items' }}
                </p>
                <button
                  type="button"
                  class="text-xs font-bold text-muted transition hover:text-pop"
                  (click)="cart.clear()"
                >
                  Empty cart
                </button>
              </div>

              @for (line of cart.cart().items; track line.product.id) {
                <article class="flex gap-4 p-4">
                  <a
                    [routerLink]="['/p', line.product.slug]"
                    class="ob-media size-24 shrink-0 rounded-xl border border-line sm:size-28"
                  >
                    <img
                      [src]="image(line)"
                      [alt]="line.product.name"
                      [obImgFallback]="line.product.name"
                    />
                  </a>

                  <div class="flex min-w-0 flex-1 flex-col">
                    <p class="text-[11px] font-bold tracking-wider text-muted uppercase">
                      {{ line.product.brand }}
                    </p>
                    <h2 class="text-sm leading-snug font-semibold">
                      <a [routerLink]="['/p', line.product.slug]" class="ob-clamp-2 hover:text-brand">{{
                        line.product.name
                      }}</a>
                    </h2>

                    <p class="mt-1 text-xs font-semibold" [class]="stock(line).tone">
                      {{ stock(line).text }}
                    </p>

                    @if (line.exceedsStock) {
                      <p
                        class="mt-1.5 flex items-start gap-1.5 rounded-lg bg-pop-soft px-2.5 py-1.5 text-xs font-semibold text-pop"
                      >
                        <ob-icon name="alert-triangle" [size]="14" class="mt-px shrink-0" />
                        Only {{ line.product.stock }} available — reduce the quantity before
                        checking out.
                      </p>
                    }

                    <div class="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-3">
                      <ob-qty-stepper
                        [value]="line.qty"
                        [stock]="line.product.stock"
                        [label]="line.product.name"
                        [disabled]="cart.isPending(line.product.id)"
                        (valueChange)="cart.setQty(line.product.id, $event)"
                      />
                      <button
                        type="button"
                        class="flex items-center gap-1.5 text-xs font-bold text-muted transition hover:text-pop"
                        (click)="cart.remove(line)"
                      >
                        <ob-icon name="trash" [size]="14" />
                        Remove
                      </button>
                      @if (line.product.freeShipping) {
                        <span class="flex items-center gap-1.5 text-xs font-semibold text-teal">
                          <ob-icon name="truck" [size]="14" /> Free delivery
                        </span>
                      }
                    </div>
                  </div>

                  <div class="shrink-0 text-right">
                    <ob-price
                      [cents]="line.lineTotalCents"
                      size="sm"
                      class="justify-end text-right"
                    />
                    @if (line.qty > 1) {
                      <p class="mt-1 text-xs text-muted">
                        {{ line.product.priceCents | money: 'short' }} each
                      </p>
                    }
                  </div>
                </article>
              }
            </div>

            <a routerLink="/" class="ob-btn ob-btn-ghost mt-4">
              <ob-icon name="arrow-left" [size]="16" /> Continue shopping
            </a>
          </div>

          <!-- ================================================ summary -->
          <aside class="lg:sticky lg:top-36 lg:self-start">
            <div class="ob-card p-5">
              <h2 class="text-base font-bold">Order summary</h2>

              <dl class="mt-4 space-y-2.5 text-sm">
                <div class="flex justify-between">
                  <dt class="text-muted">Subtotal ({{ cart.itemCount() }} items)</dt>
                  <dd class="font-semibold">{{ cart.cart().subtotalCents | money }}</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-muted">Delivery</dt>
                  <dd class="font-semibold">
                    @if (cart.cart().shippingCents === 0) {
                      <span class="text-teal">Free</span>
                    } @else {
                      {{ cart.cart().shippingCents | money }}
                    }
                  </dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-muted">VAT (14%)</dt>
                  <dd class="font-semibold">{{ cart.cart().taxCents | money }}</dd>
                </div>
              </dl>

              <div class="mt-4 flex items-baseline justify-between border-t border-line pt-4">
                <span class="text-sm font-bold">Order total</span>
                <ob-price [cents]="cart.cart().totalCents" size="lg" />
              </div>

              <!-- delivery speed -->
              <fieldset class="mt-5">
                <legend class="ob-label">Delivery speed</legend>
                <div class="space-y-2">
                  @for (option of shippingOptions; track option.value) {
                    <label
                      class="flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition"
                      [class]="
                        cart.shippingMethod() === option.value
                          ? 'border-brand bg-brand-soft'
                          : 'border-line hover:border-muted'
                      "
                    >
                      <input
                        type="radio"
                        name="shipping"
                        class="mt-0.5 size-4 shrink-0"
                        [value]="option.value"
                        [checked]="cart.shippingMethod() === option.value"
                        (change)="cart.setShippingMethod(option.value)"
                      />
                      <span class="min-w-0 flex-1">
                        <span class="flex items-baseline justify-between gap-2">
                          <span class="text-sm font-bold">{{ option.label }}</span>
                          <span class="text-xs font-semibold">{{ option.price }}</span>
                        </span>
                        <span class="mt-0.5 block text-xs text-muted">{{ option.note }}</span>
                      </span>
                    </label>
                  }
                </div>
              </fieldset>

              @if (blocked()) {
                <p
                  class="mt-4 flex items-start gap-2 rounded-lg bg-pop-soft p-3 text-xs font-semibold text-pop"
                  role="alert"
                >
                  <ob-icon name="alert-triangle" [size]="15" class="mt-px shrink-0" />
                  Some quantities are above what's in stock. Adjust them to continue.
                </p>
              }

              <button
                type="button"
                class="ob-btn ob-btn-primary ob-btn-lg mt-4 w-full"
                [disabled]="blocked()"
                (click)="checkout()"
              >
                <ob-icon name="lock" [size]="16" />
                {{ auth.isAuthenticated() ? 'Proceed to checkout' : 'Sign in to check out' }}
              </button>

              @if (!auth.isAuthenticated()) {
                <p class="mt-2.5 text-center text-xs text-muted">
                  Your cart is saved on this device and merges with your account when you sign in.
                </p>
              }

              <ul class="mt-5 space-y-2 border-t border-line pt-4 text-xs text-muted">
                <li class="flex items-center gap-2">
                  <ob-icon name="credit-card" [size]="14" class="text-brand" />
                  Pay by card or Orbit E-Wallet
                </li>
                <li class="flex items-center gap-2">
                  <ob-icon name="rotate-ccw" [size]="14" class="text-brand" />
                  Free returns within 30 days
                </li>
                <li class="flex items-center gap-2">
                  <ob-icon name="lock" [size]="14" class="text-brand" />
                  Wallet credentials never touch this shop
                </li>
              </ul>
            </div>
          </aside>
        </div>
      }
    </div>
  `,
})
export class CartComponent {
  protected readonly cart = inject(CartService);
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly image = (line: CartLine) => primaryImage(line.product);
  protected readonly stock = (line: CartLine) => stockLabel(line.product.stock);

  protected readonly shippingOptions = [
    {
      value: 'standard' as const,
      label: 'Standard',
      price: 'EGP 50',
      note: '3–5 working days · free over EGP 1,000',
    },
    { value: 'express' as const, label: 'Express', price: 'EGP 150', note: '1–2 working days' },
  ];

  protected readonly freeShippingRemaining = computed(() =>
    Math.max(0, FREE_SHIPPING_THRESHOLD_CENTS - this.cart.cart().subtotalCents),
  );

  protected readonly freeShippingProgress = computed(() =>
    Math.min(100, (this.cart.cart().subtotalCents / FREE_SHIPPING_THRESHOLD_CENTS) * 100),
  );

  /** The API rejects the order with 409 OUT_OF_STOCK, so stop it here first. */
  protected readonly blocked = computed(() => this.cart.cart().items.some((l) => l.exceedsStock));

  protected checkout(): void {
    if (this.auth.isAuthenticated()) void this.router.navigate(['/checkout']);
    else void this.router.navigate(['/login'], { queryParams: { returnUrl: '/checkout' } });
  }
}
