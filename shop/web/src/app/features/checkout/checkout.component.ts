import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { ApiError } from '../../core/api-error';
import { CartService } from '../../core/cart.service';
import { Address, Order, Payment, PaymentResultResponse, ShippingMethod } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { AddressFormComponent } from '../../shared/address-form.component';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { IconComponent } from '../../shared/icon.component';
import { ImgFallbackDirective } from '../../shared/img-fallback.directive';
import { MoneyPipe } from '../../shared/money.pipe';
import { primaryImage } from '../../shared/product-utils';
import { CARD_ERROR_HINTS, CardDraft, parseExpiry, validateCard } from './card';
import { CardFormComponent } from './card-form.component';
import { ConfirmationComponent } from './confirmation.component';
import { OrbitPaymentComponent } from './orbit-payment.component';

type StepId = 'address' | 'shipping' | 'payment' | 'review';
type Method = 'card' | 'orbit';

interface CardFault {
  title: string;
  message: string;
  hint: string;
}

/**
 * Checkout: Address → Shipping → Payment → Review.
 *
 * The order is only created (`POST /orders`, CONTRACT §6) when the shopper
 * commits at the Review step — creating it earlier would litter the account
 * with abandoned PENDING orders. Payment then runs against that order.
 */
@Component({
  selector: 'ob-checkout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AddressFormComponent,
    CardFormComponent,
    ConfirmationComponent,
    EmptyStateComponent,
    IconComponent,
    ImgFallbackDirective,
    MoneyPipe,
    OrbitPaymentComponent,
  ],
  host: { class: 'block' },
  template: `
    <!-- ======================================================= success -->
    @if (paidOrder(); as paid) {
      <ob-confirmation [order]="paid.order" [payment]="paid.payment" />
    } @else if (cart.initialising() && !order()) {
      <div class="ob-container py-6">
        <div class="ob-skeleton h-96 rounded-2xl"></div>
      </div>
    } @else if (cart.isEmpty() && !order()) {
      <div class="ob-container py-6">
        <div class="ob-panel">
          <ob-empty-state
            art="cart"
            title="There's nothing to check out"
            message="Your cart is empty. Add something first and we'll pick this back up."
          >
            <a routerLink="/" class="ob-btn ob-btn-primary">Browse the shop</a>
          </ob-empty-state>
        </div>
      </div>
    } @else {
      <div class="ob-container py-6">
        <h1 class="mb-5 text-2xl font-extrabold tracking-tight">Checkout</h1>

        <!-- ================================================ stepper -->
        <ol class="mb-6 flex items-center overflow-x-auto ob-noscroll" aria-label="Checkout progress">
          @for (step of steps; track step.id; let i = $index; let last = $last) {
            <li class="flex flex-1 items-center" [class.flex-none]="last">
              <button
                type="button"
                class="flex shrink-0 items-center gap-2.5 rounded-lg px-1 py-1 text-left transition"
                [disabled]="i > maxReachedIndex()"
                (click)="goToStep(step.id)"
              >
                <span
                  class="grid size-9 shrink-0 place-items-center rounded-full border-2 text-xs font-extrabold transition"
                  [class]="
                    i < currentIndex()
                      ? 'border-teal bg-teal text-white'
                      : i === currentIndex()
                        ? 'border-brand bg-brand text-white'
                        : 'border-line bg-surface text-muted'
                  "
                >
                  @if (i < currentIndex()) {
                    <ob-icon name="check" [size]="16" [strokeWidth]="2.6" />
                  } @else {
                    {{ i + 1 }}
                  }
                </span>
                <span class="hidden sm:block">
                  <span
                    class="block text-[13px] font-bold"
                    [class]="i <= currentIndex() ? 'text-body' : 'text-muted'"
                    >{{ step.label }}</span
                  >
                  <span class="block text-[11px] text-muted">{{ step.hint }}</span>
                </span>
              </button>
              @if (!last) {
                <span
                  class="mx-2 h-0.5 flex-1 rounded"
                  [class]="i < currentIndex() ? 'bg-teal' : 'bg-line'"
                ></span>
              }
            </li>
          }
        </ol>

        <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <div class="min-w-0">
            @switch (step()) {
              <!-- ============================================ address -->
              @case ('address') {
                <section class="ob-panel p-5">
                  <h2 class="text-base font-bold">Delivery address</h2>
                  <p class="mt-0.5 mb-4 text-sm text-muted">Where should this order go?</p>

                  @if (loadingAddresses()) {
                    <div class="space-y-3">
                      @for (i of [0, 1]; track i) {
                        <div class="ob-skeleton h-24 rounded-xl"></div>
                      }
                    </div>
                  } @else if (addingAddress()) {
                    <ob-address-form
                      (saved)="onAddressSaved($event)"
                      (cancelled)="addingAddress.set(false)"
                    />
                  } @else {
                    @if (addresses().length === 0) {
                      <p
                        class="mb-4 rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted"
                      >
                        You don't have a delivery address saved yet.
                      </p>
                    }

                    <ul class="space-y-3">
                      @for (address of addresses(); track address.id) {
                        <li>
                          <label
                            class="flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition"
                            [class]="
                              selectedAddressId() === address.id
                                ? 'border-brand bg-brand-soft/50 ring-1 ring-brand/25'
                                : 'border-line hover:border-muted'
                            "
                          >
                            <input
                              type="radio"
                              name="address"
                              class="mt-0.5 size-4 shrink-0"
                              [checked]="selectedAddressId() === address.id"
                              (change)="selectedAddressId.set(address.id)"
                            />
                            <span class="min-w-0 flex-1">
                              <span class="flex flex-wrap items-center gap-2">
                                <span class="text-sm font-bold">{{
                                  address.label || address.fullName
                                }}</span>
                                @if (address.isDefault) {
                                  <span class="ob-badge bg-brand text-white">Default</span>
                                }
                              </span>
                              <span class="mt-1 block text-xs leading-relaxed text-muted">
                                {{ address.fullName }} · {{ address.line1 }}@if (address.line2) {,
                                {{ address.line2 }}} · {{ address.city }},
                                {{ address.governorate }} · {{ address.phone }}
                              </span>
                            </span>
                          </label>
                        </li>
                      }
                    </ul>

                    <button
                      type="button"
                      class="ob-btn ob-btn-ghost mt-4 w-full"
                      (click)="addingAddress.set(true)"
                    >
                      <ob-icon name="plus" [size]="16" /> Use a new address
                    </button>

                    <div class="mt-5 flex justify-end">
                      <button
                        type="button"
                        class="ob-btn ob-btn-brand"
                        [disabled]="!selectedAddressId()"
                        (click)="goToStep('shipping')"
                      >
                        Continue to delivery
                        <ob-icon name="arrow-right" [size]="16" />
                      </button>
                    </div>
                  }
                </section>
              }

              <!-- =========================================== shipping -->
              @case ('shipping') {
                <section class="ob-panel p-5">
                  <h2 class="text-base font-bold">Delivery speed</h2>
                  <p class="mt-0.5 mb-4 text-sm text-muted">
                    Standard is free once your subtotal passes {{ 100000 | money: 'short' }}.
                  </p>

                  <ul class="space-y-3">
                    @for (option of shippingOptions; track option.value) {
                      <li>
                        <label
                          class="flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition"
                          [class]="
                            cart.shippingMethod() === option.value
                              ? 'border-brand bg-brand-soft/50 ring-1 ring-brand/25'
                              : 'border-line hover:border-muted'
                          "
                        >
                          <input
                            type="radio"
                            name="shippingMethod"
                            class="mt-0.5 size-4 shrink-0"
                            [checked]="cart.shippingMethod() === option.value"
                            (change)="cart.setShippingMethod(option.value)"
                          />
                          <span class="min-w-0 flex-1">
                            <span class="flex flex-wrap items-baseline justify-between gap-2">
                              <span class="text-sm font-bold">{{ option.label }}</span>
                              <span class="text-sm font-bold">{{ option.price }}</span>
                            </span>
                            <span class="mt-0.5 block text-xs text-muted">{{ option.note }}</span>
                          </span>
                        </label>
                      </li>
                    }
                  </ul>

                  <div class="mt-5 flex justify-between">
                    <button type="button" class="ob-btn ob-btn-ghost" (click)="goToStep('address')">
                      <ob-icon name="arrow-left" [size]="16" /> Back
                    </button>
                    <button type="button" class="ob-btn ob-btn-brand" (click)="goToStep('payment')">
                      Continue to payment
                      <ob-icon name="arrow-right" [size]="16" />
                    </button>
                  </div>
                </section>
              }

              <!-- ============================================ payment -->
              @case ('payment') {
                <section class="ob-panel p-5">
                  <h2 class="text-base font-bold">How would you like to pay?</h2>
                  <p class="mt-0.5 mb-4 text-sm text-muted">
                    Nothing is charged until you confirm on the next step.
                  </p>

                  <div class="grid gap-3 sm:grid-cols-2">
                    @for (option of methods; track option.value) {
                      <button
                        type="button"
                        class="flex flex-col items-start rounded-xl border p-4 text-left transition"
                        [class]="
                          method() === option.value
                            ? 'border-brand bg-brand-soft/50 ring-1 ring-brand/25'
                            : 'border-line hover:border-muted'
                        "
                        [attr.aria-pressed]="method() === option.value"
                        (click)="method.set(option.value)"
                      >
                        <span class="flex w-full items-center gap-2.5">
                          <span
                            class="grid size-10 shrink-0 place-items-center rounded-xl"
                            [class]="
                              method() === option.value
                                ? 'bg-brand text-white'
                                : 'bg-line-soft text-muted'
                            "
                          >
                            <ob-icon [name]="option.icon" [size]="20" />
                          </span>
                          <span class="text-sm font-bold">{{ option.label }}</span>
                          @if (method() === option.value) {
                            <ob-icon name="check-circle" [size]="18" class="ml-auto text-brand" />
                          }
                        </span>
                        <span class="mt-2 text-xs leading-relaxed text-muted">{{ option.note }}</span>
                      </button>
                    }
                  </div>

                  @if (method() === 'card') {
                    <div class="mt-5 border-t border-line pt-5">
                      <ob-card-form
                        [initial]="cardDraft()"
                        [showErrors]="showCardErrors()"
                        (changed)="onCardChanged($event)"
                      />
                    </div>
                  } @else {
                    <div class="mt-5 border-t border-line pt-5">
                      <p class="flex items-start gap-2.5 text-sm leading-relaxed text-muted">
                        <ob-icon name="info" [size]="16" class="mt-0.5 shrink-0 text-brand" />
                        You'll sign in to your Orbit wallet on the next step, then confirm the
                        exact amount before anything is debited.
                      </p>
                    </div>
                  }

                  <div class="mt-5 flex justify-between">
                    <button type="button" class="ob-btn ob-btn-ghost" (click)="goToStep('shipping')">
                      <ob-icon name="arrow-left" [size]="16" /> Back
                    </button>
                    <button
                      type="button"
                      class="ob-btn ob-btn-brand"
                      [disabled]="method() === 'card' && !cardValid()"
                      (click)="goToStep('review')"
                    >
                      Review your order
                      <ob-icon name="arrow-right" [size]="16" />
                    </button>
                  </div>
                </section>
              }

              <!-- ============================================= review -->
              @case ('review') {
                <section class="space-y-5">
                  <!-- what we're about to do -->
                  <div class="ob-panel divide-y divide-line">
                    <div class="flex items-start gap-3 p-4">
                      <ob-icon name="map-pin" [size]="17" class="mt-0.5 shrink-0 text-brand" />
                      <div class="min-w-0 flex-1 text-sm">
                        <p class="font-bold">Delivering to</p>
                        @if (selectedAddress(); as address) {
                          <p class="mt-0.5 text-xs leading-relaxed text-muted">
                            {{ address.fullName }} · {{ address.line1 }}, {{ address.city }},
                            {{ address.governorate }} · {{ address.phone }}
                          </p>
                        }
                      </div>
                      <button
                        type="button"
                        class="shrink-0 text-xs font-bold text-brand hover:underline"
                        (click)="goToStep('address')"
                      >
                        Change
                      </button>
                    </div>

                    <div class="flex items-start gap-3 p-4">
                      <ob-icon name="truck" [size]="17" class="mt-0.5 shrink-0 text-brand" />
                      <div class="min-w-0 flex-1 text-sm">
                        <p class="font-bold">
                          {{ cart.shippingMethod() === 'express' ? 'Express' : 'Standard' }} delivery
                        </p>
                        <p class="mt-0.5 text-xs text-muted">
                          {{
                            cart.shippingMethod() === 'express'
                              ? '1–2 working days'
                              : '3–5 working days'
                          }}
                        </p>
                      </div>
                      <button
                        type="button"
                        class="shrink-0 text-xs font-bold text-brand hover:underline"
                        (click)="goToStep('shipping')"
                      >
                        Change
                      </button>
                    </div>

                    <div class="flex items-start gap-3 p-4">
                      <ob-icon
                        [name]="method() === 'orbit' ? 'wallet' : 'credit-card'"
                        [size]="17"
                        class="mt-0.5 shrink-0 text-brand"
                      />
                      <div class="min-w-0 flex-1 text-sm">
                        <p class="font-bold">
                          {{ method() === 'orbit' ? 'Orbit E-Wallet' : 'Credit or debit card' }}
                        </p>
                        <p class="mt-0.5 text-xs text-muted">
                          {{
                            method() === 'orbit'
                              ? 'You will sign in and confirm below'
                              : 'Charged when you confirm'
                          }}
                        </p>
                      </div>
                      <button
                        type="button"
                        class="shrink-0 text-xs font-bold text-brand hover:underline"
                        [disabled]="!!order()"
                        (click)="goToStep('payment')"
                      >
                        Change
                      </button>
                    </div>
                  </div>

                  <!-- items -->
                  <div class="ob-panel divide-y divide-line">
                    <h2 class="px-4 py-3 text-sm font-bold">
                      {{ cart.cart().items.length }} product{{
                        cart.cart().items.length === 1 ? '' : 's'
                      }}
                    </h2>
                    @for (line of cart.cart().items; track line.product.id) {
                      <div class="flex items-center gap-3 p-3">
                        <span class="ob-media size-14 shrink-0 rounded-lg border border-line">
                          <img
                            [src]="lineImage(line.product)"
                            [alt]="line.product.name"
                            [obImgFallback]="line.product.name"
                          />
                        </span>
                        <div class="min-w-0 flex-1">
                          <p class="ob-clamp-1 text-sm font-semibold">{{ line.product.name }}</p>
                          <p class="text-xs text-muted">Quantity {{ line.qty }}</p>
                        </div>
                        <p class="shrink-0 text-sm font-bold">{{ line.lineTotalCents | money }}</p>
                      </div>
                    }
                  </div>

                  <!-- card failure -->
                  @if (cardFault(); as fault) {
                    <div class="rounded-xl border border-pop/30 bg-pop-soft p-4" role="alert">
                      <div class="flex items-start gap-3">
                        <ob-icon name="alert-circle" [size]="20" class="mt-0.5 shrink-0 text-pop" />
                        <div>
                          <p class="text-sm font-bold text-pop">{{ fault.title }}</p>
                          <p class="mt-1 text-sm leading-relaxed text-body/85">
                            {{ fault.message }}
                          </p>
                          <p class="mt-2 text-xs leading-relaxed text-muted">{{ fault.hint }}</p>
                        </div>
                      </div>
                      <div class="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          class="ob-btn ob-btn-ghost ob-btn-sm"
                          (click)="goToStep('payment')"
                        >
                          <ob-icon name="credit-card" [size]="14" /> Edit card details
                        </button>
                        <button
                          type="button"
                          class="ob-btn ob-btn-ghost ob-btn-sm"
                          (click)="switchToOrbit()"
                        >
                          <ob-icon name="wallet" [size]="14" /> Pay with Orbit instead
                        </button>
                      </div>
                    </div>
                  }

                  <!-- order-level failure (cart empty, stock, review hold) -->
                  @if (orderFault(); as message) {
                    <div class="rounded-xl border border-pop/30 bg-pop-soft p-4" role="alert">
                      <p class="flex items-start gap-2.5 text-sm font-semibold text-pop">
                        <ob-icon name="alert-circle" [size]="18" class="mt-px shrink-0" />
                        {{ message }}
                      </p>
                      <a routerLink="/cart" class="ob-btn ob-btn-ghost ob-btn-sm mt-3">
                        Back to your cart
                      </a>
                    </div>
                  }

                  <!-- payment execution -->
                  @if (method() === 'orbit' && order(); as placedOrder) {
                    <ob-orbit-payment
                      [orderId]="placedOrder.id"
                      [amountCents]="placedOrder.totalCents"
                      (paid)="onPaid($event)"
                      (switchToCard)="switchToCard()"
                      (orderChanged)="lockOrder()"
                    />
                  } @else if (!orderLocked()) {
                    <button
                      type="button"
                      class="ob-btn ob-btn-primary ob-btn-lg w-full"
                      [disabled]="placing() || !selectedAddressId()"
                      (click)="placeAndPay()"
                    >
                      @if (placing()) {
                        <ob-icon name="loader" [size]="18" class="ob-spin" />
                        {{ placingLabel() }}
                      } @else {
                        <ob-icon name="lock" [size]="17" />
                        @if (method() === 'orbit') {
                          Place order and sign in to Orbit
                        } @else {
                          Pay {{ cart.cart().totalCents | money }}
                        }
                      }
                    </button>
                  }

                  @if (!orderLocked()) {
                    <p class="text-center text-xs leading-relaxed text-muted">
                      By placing this order you agree to the fictional terms of a fictional shop.
                    </p>
                  }
                </section>
              }
            }
          </div>

          <!-- ============================================== summary -->
          <aside class="lg:sticky lg:top-36 lg:self-start">
            <div class="ob-card p-5">
              <h2 class="text-base font-bold">Order summary</h2>
              <dl class="mt-4 space-y-2.5 text-sm">
                <div class="flex justify-between">
                  <dt class="text-muted">Subtotal ({{ summary().itemCount }} items)</dt>
                  <dd class="font-semibold">{{ summary().subtotalCents | money }}</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-muted">Delivery</dt>
                  <dd class="font-semibold">
                    @if (summary().shippingCents === 0) {
                      <span class="text-teal">Free</span>
                    } @else {
                      {{ summary().shippingCents | money }}
                    }
                  </dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-muted">VAT (14%)</dt>
                  <dd class="font-semibold">{{ summary().taxCents | money }}</dd>
                </div>
                <div
                  class="flex items-baseline justify-between border-t border-line pt-3 text-base"
                >
                  <dt class="font-bold">Total</dt>
                  <dd class="font-extrabold">{{ summary().totalCents | money }}</dd>
                </div>
              </dl>

              @if (order(); as placed) {
                <p class="mt-4 rounded-lg bg-line-soft px-3 py-2.5 text-xs">
                  <span class="font-bold">Order {{ placed.orderNumber }}</span>
                  <span class="mt-0.5 block text-muted">
                    Placed and awaiting payment. The price is locked in.
                  </span>
                </p>
              }

              <ul class="mt-5 space-y-2 border-t border-line pt-4 text-xs text-muted">
                <li class="flex items-start gap-2">
                  <ob-icon name="lock" [size]="14" class="mt-px shrink-0 text-brand" />
                  Wallet credentials go straight to Orbit — never stored here.
                </li>
                <li class="flex items-start gap-2">
                  <ob-icon name="shield-check" [size]="14" class="mt-px shrink-0 text-brand" />
                  Card numbers are never persisted; only brand and last 4.
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    }
  `,
})
export class CheckoutComponent {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  protected readonly cart = inject(CartService);

  protected readonly steps: { id: StepId; label: string; hint: string }[] = [
    { id: 'address', label: 'Address', hint: 'Where it goes' },
    { id: 'shipping', label: 'Delivery', hint: 'How fast' },
    { id: 'payment', label: 'Payment', hint: 'How you pay' },
    { id: 'review', label: 'Review', hint: 'Confirm & pay' },
  ];

  protected readonly shippingOptions = [
    {
      value: 'standard' as ShippingMethod,
      label: 'Standard delivery',
      price: 'EGP 50',
      note: '3–5 working days · free when the subtotal is EGP 1,000 or more',
    },
    {
      value: 'express' as ShippingMethod,
      label: 'Express delivery',
      price: 'EGP 150',
      note: '1–2 working days, dispatched the same day if ordered before 2pm',
    },
  ];

  protected readonly methods = [
    {
      value: 'card' as Method,
      icon: 'credit-card',
      label: 'Credit or debit card',
      note: 'Visa, Mastercard, Amex or UnionPay. Processed by our simulated acquirer.',
    },
    {
      value: 'orbit' as Method,
      icon: 'wallet',
      label: 'Orbit E-Wallet',
      note: 'Pay straight from your Orbit balance in two steps. No card needed.',
    },
  ];

  protected readonly step = signal<StepId>('address');
  protected readonly method = signal<Method>('card');

  /**
   * Card entry state is owned here, not by `ob-card-form`: the form is
   * destroyed when the shopper moves to the Review step, and the details must
   * survive that (and survive coming back to edit them).
   */
  protected readonly cardDraft = signal<CardDraft>({
    number: '',
    expiry: '',
    cvv: '',
    holder: '',
  });
  protected readonly showCardErrors = signal(false);
  protected readonly cardValid = computed(
    () => Object.keys(validateCard(this.cardDraft())).length === 0,
  );

  protected readonly addresses = signal<Address[]>([]);
  protected readonly selectedAddressId = signal<string | null>(null);
  protected readonly loadingAddresses = signal(true);
  protected readonly addingAddress = signal(false);

  protected readonly order = signal<Order | null>(null);
  protected readonly paidOrder = signal<{ order: Order; payment: Payment } | null>(null);
  protected readonly placing = signal(false);
  protected readonly placingLabel = signal('Placing your order…');
  protected readonly cardFault = signal<CardFault | null>(null);
  protected readonly orderFault = signal<string | null>(null);
  /** Set when the order can no longer be paid from this screen (§8 hold). */
  protected readonly orderLocked = signal(false);

  protected readonly currentIndex = computed(() =>
    this.steps.findIndex((s) => s.id === this.step()),
  );

  /** Steps unlock as they are completed; you can always go back. */
  protected readonly maxReachedIndex = computed(() => {
    if (this.order()) return 3;
    if (this.method() === 'card' && !this.cardValid()) return 2;
    return 3;
  });

  protected readonly selectedAddress = computed(() =>
    this.addresses().find((a) => a.id === this.selectedAddressId()),
  );

  /** Once the order exists its snapshot is authoritative, not the live cart. */
  protected readonly summary = computed(() => {
    const placed = this.order();
    if (placed) {
      return {
        subtotalCents: placed.subtotalCents,
        shippingCents: placed.shippingCents,
        taxCents: placed.taxCents,
        totalCents: placed.totalCents,
        itemCount: placed.itemCount ?? this.cart.itemCount(),
      };
    }
    const cart = this.cart.cart();
    return {
      subtotalCents: cart.subtotalCents,
      shippingCents: cart.shippingCents,
      taxCents: cart.taxCents,
      totalCents: cart.totalCents,
      itemCount: cart.itemCount,
    };
  });

  protected readonly lineImage = primaryImage;

  constructor() {
    this.cart.refresh();
    this.loadAddresses();

    // `/checkout?order=<id>` resumes payment for an existing PENDING order.
    const resumeId = this.route.snapshot.queryParamMap.get('order');
    if (resumeId) this.resume(resumeId);
  }

  protected onCardChanged(event: { draft: CardDraft; valid: boolean }): void {
    this.cardDraft.set(event.draft);
  }

  protected goToStep(step: StepId): void {
    this.step.set(step);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected onAddressSaved(address: Address): void {
    this.addingAddress.set(false);
    this.selectedAddressId.set(address.id);
    this.loadAddresses();
  }

  protected switchToCard(): void {
    this.method.set('card');
    this.goToStep('payment');
  }

  protected switchToOrbit(): void {
    this.cardFault.set(null);
    this.method.set('orbit');
    this.goToStep('review');
  }

  protected lockOrder(): void {
    this.orderLocked.set(true);
  }

  /**
   * Create the order if it doesn't exist yet, then run the chosen payment.
   * For Orbit this stops after the order is created — the wallet component
   * takes over and drives verify/confirm itself.
   */
  protected placeAndPay(): void {
    this.cardFault.set(null);
    this.orderFault.set(null);

    const existing = this.order();
    if (existing) {
      this.payCard(existing);
      return;
    }

    const addressId = this.selectedAddressId();
    if (!addressId) {
      this.goToStep('address');
      return;
    }

    this.placing.set(true);
    this.placingLabel.set('Placing your order…');

    this.api
      .createOrder({ addressId, shippingMethod: this.cart.shippingMethod() })
      .subscribe({
        next: (res) => {
          this.order.set(res.order);
          if (this.method() === 'card') {
            this.payCard(res.order);
          } else {
            // Orbit takes over from here.
            this.placing.set(false);
          }
        },
        error: (err: ApiError) => {
          this.placing.set(false);
          this.orderFault.set(err.message);
          if (err.code === 'CART_EMPTY') void this.router.navigate(['/cart']);
        },
      });
  }

  private payCard(order: Order): void {
    const draft = this.cardDraft();
    const expiry = parseExpiry(draft.expiry);

    if (!this.cardValid() || !expiry) {
      this.showCardErrors.set(true);
      this.placing.set(false);
      this.goToStep('payment');
      return;
    }

    this.placing.set(true);
    this.placingLabel.set('Contacting your bank…');

    this.api
      .payWithCard(order.id, {
        cardNumber: draft.number.replace(/\s/g, ''),
        holderName: draft.holder.trim(),
        expMonth: expiry.month,
        expYear: expiry.year,
        cvv: draft.cvv,
      })
      .subscribe({
        next: (res) => this.onPaid(res),
        error: (err: ApiError) => {
          this.placing.set(false);
          this.handleCardError(err);
        },
      });
  }

  private handleCardError(err: ApiError): void {
    if (err.code === 'ORDER_UNDER_REVIEW' || err.code === 'ORBIT_UNCERTAIN') {
      this.orderLocked.set(true);
      this.orderFault.set(err.message);
      return;
    }
    if (err.code === 'ORDER_ALREADY_PAID') {
      this.orderLocked.set(true);
      this.orderFault.set(err.message);
      const placed = this.order();
      if (placed) void this.router.navigate(['/orders', placed.id]);
      return;
    }

    if (err.code === 'CARD_INVALID' || err.code === 'VALIDATION_FAILED') {
      this.showCardErrors.set(true);
      this.goToStep('payment');
    }

    this.cardFault.set({
      title: cardFaultTitle(err.code),
      message: err.message,
      hint: CARD_ERROR_HINTS[err.code] ?? 'Nothing was charged. Check the details and try again.',
    });
  }

  protected onPaid(result: PaymentResultResponse): void {
    this.placing.set(false);
    this.paidOrder.set({ order: result.order, payment: result.payment });
    this.cart.refresh();
    this.toast.success('Payment approved', `Order ${result.order.orderNumber} is confirmed.`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private loadAddresses(): void {
    this.loadingAddresses.set(true);
    this.api.addresses().subscribe({
      next: (res) => {
        this.addresses.set(res.items);
        this.loadingAddresses.set(false);
        this.addingAddress.set(res.items.length === 0);
        const preferred = res.items.find((a) => a.isDefault) ?? res.items[0];
        if (preferred && !this.selectedAddressId()) this.selectedAddressId.set(preferred.id);
      },
      error: () => {
        this.loadingAddresses.set(false);
        this.addingAddress.set(true);
      },
    });
  }

  private resume(orderId: string): void {
    this.api.order(orderId).subscribe({
      next: (res) => {
        if (res.order.paymentStatus === 'PAID') {
          void this.router.navigate(['/orders', res.order.id]);
          return;
        }
        this.order.set(res.order);
        this.cart.setShippingMethod(res.order.shippingMethod);
        this.goToStep('payment');
        if (res.order.paymentStatus === 'UNCERTAIN' || res.order.status === 'NEEDS_REVIEW') {
          this.orderLocked.set(true);
          this.orderFault.set(
            'This order is on hold while we confirm an earlier payment attempt with Orbit.',
          );
        }
      },
      error: (err: ApiError) => this.toast.error("Couldn't load that order", err.message),
    });
  }
}

function cardFaultTitle(code: string): string {
  switch (code) {
    case 'CARD_DECLINED':
      return 'Your card was declined';
    case 'CARD_INSUFFICIENT_FUNDS':
      return 'Not enough funds on that card';
    case 'CARD_EXPIRED':
      return 'That card has expired';
    case 'CARD_INCORRECT_CVC':
      return 'That security code was wrong';
    case 'CARD_PROCESSING_ERROR':
      return 'The card network had a problem';
    case 'CARD_INVALID':
    case 'VALIDATION_FAILED':
      return 'Check your card details';
    case 'RATE_LIMITED':
      return 'Too many attempts';
    default:
      return "That payment didn't go through";
  }
}
