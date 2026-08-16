import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { catchError, map, of, switchMap, tap } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { CartService } from '../../core/cart.service';
import { CatalogStore } from '../../core/catalog.store';
import { Product, ProductCard, ProductDetailResponse } from '../../core/models';
import { WishlistService } from '../../core/wishlist.service';
import { AccentDirective } from '../../shared/accent.directive';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { IconComponent } from '../../shared/icon.component';
import { MoneyPipe } from '../../shared/money.pipe';
import { PriceComponent } from '../../shared/price.component';
import { ProductRailComponent } from '../../shared/product-rail.component';
import { QtyStepperComponent } from '../../shared/qty-stepper.component';
import { SkeletonComponent } from '../../shared/skeleton.component';
import { StarRatingComponent } from '../../shared/star-rating.component';
import { badgeStyle, deliveryEstimate, stockLabel } from '../../shared/product-utils';
import { GalleryComponent } from './gallery.component';
import { ReviewsPanelComponent } from './reviews-panel.component';

type Tab = 'description' | 'specifications' | 'reviews';

@Component({
  selector: 'ob-product',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    DatePipe,
    AccentDirective,
    EmptyStateComponent,
    GalleryComponent,
    IconComponent,
    MoneyPipe,
    PriceComponent,
    ProductRailComponent,
    QtyStepperComponent,
    ReviewsPanelComponent,
    SkeletonComponent,
    StarRatingComponent,
  ],
  host: { class: 'block' },
  template: `
    @if (loading()) {
      <div class="ob-container py-6">
        <div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20.5rem]">
          <div class="grid gap-6 md:grid-cols-2">
            <div class="ob-skeleton aspect-square rounded-2xl"></div>
            <div class="space-y-4">
              <div class="ob-skeleton h-4 w-24 rounded"></div>
              <ob-skeleton variant="lines" [count]="3" />
              <div class="ob-skeleton h-10 w-40 rounded"></div>
              <ob-skeleton variant="lines" [count]="5" />
            </div>
          </div>
          <div class="ob-skeleton h-80 rounded-2xl"></div>
        </div>
      </div>
    } @else if (product(); as p) {
      <div [obAccent]="accent()">
        <div class="ob-container py-5">
          <!-- ================================================ breadcrumb -->
          <nav
            aria-label="Breadcrumb"
            class="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-muted"
          >
            <a routerLink="/" class="transition hover:text-brand">Home</a>
            <ob-icon name="chevron-right" [size]="12" />
            <a [routerLink]="['/c', p.category.slug]" class="transition hover:text-brand">{{
              p.category.name
            }}</a>
            @if (p.subcategory; as sub) {
              <ob-icon name="chevron-right" [size]="12" />
              <a [routerLink]="['/c', p.category.slug, sub.slug]" class="transition hover:text-brand">{{
                sub.name
              }}</a>
            }
            <ob-icon name="chevron-right" [size]="12" />
            <span class="ob-clamp-1 font-semibold text-body">{{ p.name }}</span>
          </nav>

          <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20.5rem] xl:gap-8">
            <!-- ========================================== main column -->
            <div class="grid gap-6 md:grid-cols-2 lg:gap-8">
              <ob-gallery [images]="p.images" [alt]="p.name" />

              <div>
                <div class="flex flex-wrap items-center gap-1.5">
                  @for (badge of p.badges; track badge) {
                    <span class="ob-badge" [class]="badgeStyle(badge).classes">{{
                      badgeStyle(badge).label
                    }}</span>
                  }
                </div>

                <a
                  routerLink="/search"
                  [queryParams]="{ brand: p.brand }"
                  class="mt-2 block text-xs font-bold tracking-wider text-[color:var(--cat-accent)] uppercase hover:underline"
                  >{{ p.brand }}</a
                >

                <h1 class="mt-1 text-xl leading-tight font-extrabold tracking-tight sm:text-2xl">
                  {{ p.name }}
                </h1>

                <button
                  type="button"
                  class="mt-2 flex w-fit items-center gap-2"
                  (click)="selectTab('reviews')"
                >
                  <ob-star-rating [rating]="p.rating" [showValue]="true" />
                  <span class="text-xs text-brand hover:underline">{{ p.ratingCount }} ratings</span>
                </button>

                <p class="mt-3 text-sm leading-relaxed text-muted">{{ p.shortDescription }}</p>

                <hr class="my-4 border-line" />

                <ob-price
                  [cents]="p.priceCents"
                  [listCents]="p.listPriceCents"
                  [discountPercent]="p.discountPercent"
                  size="xl"
                />
                @if (p.discountPercent > 0 && p.listPriceCents) {
                  <p class="mt-1 text-xs font-semibold text-pop">
                    You save {{ p.listPriceCents - p.priceCents | money }}
                  </p>
                }
                <p class="mt-1 text-xs text-muted">Inclusive of 14% VAT · SKU {{ p.sku }}</p>

                @if (p.features.length) {
                  <ul class="mt-5 space-y-2">
                    @for (feature of p.features; track feature) {
                      <li class="flex items-start gap-2.5 text-sm leading-relaxed">
                        <ob-icon
                          name="check"
                          [size]="15"
                          class="mt-0.5 shrink-0 text-[color:var(--cat-accent)]"
                        />
                        <span>{{ feature }}</span>
                      </li>
                    }
                  </ul>
                }
              </div>
            </div>

            <!-- ============================================== buy box -->
            <aside class="lg:sticky lg:top-36 lg:self-start">
              <div class="ob-card p-5">
                <ob-price
                  [cents]="p.priceCents"
                  [listCents]="p.listPriceCents"
                  [discountPercent]="p.discountPercent"
                  size="lg"
                />

                <p class="mt-3 flex items-center gap-2 text-sm">
                  <ob-icon name="truck" [size]="16" class="shrink-0 text-teal" />
                  @if (p.freeShipping) {
                    <span class="font-bold text-teal">Free delivery</span>
                  } @else {
                    <span class="font-semibold">Delivery from {{ 5000 | money }}</span>
                  }
                </p>
                <p class="mt-1 pl-6 text-xs text-muted">
                  Arrives
                  <span class="font-semibold text-body"
                    >{{ delivery().from | date: 'EEE d MMM' }} –
                    {{ delivery().to | date: 'EEE d MMM' }}</span
                  >
                </p>

                <p class="mt-3 flex items-center gap-2 text-sm font-bold" [class]="stock().tone">
                  <ob-icon
                    [name]="p.inStock ? 'check-circle' : 'alert-circle'"
                    [size]="16"
                    class="shrink-0"
                  />
                  {{ stock().text }}
                </p>

                @if (p.inStock) {
                  <div class="mt-4 flex items-center gap-3">
                    <span class="text-sm font-semibold">Quantity</span>
                    <ob-qty-stepper
                      [value]="qty()"
                      [stock]="p.stock"
                      [label]="p.name"
                      (valueChange)="qty.set($event)"
                    />
                  </div>
                }

                <div class="mt-4 space-y-2">
                  <button
                    type="button"
                    class="ob-btn ob-btn-primary ob-btn-lg w-full"
                    [disabled]="!p.inStock || adding()"
                    (click)="addToCart(p)"
                  >
                    @if (adding()) {
                      <ob-icon name="loader" [size]="17" class="ob-spin" /> Adding…
                    } @else {
                      <ob-icon name="shopping-cart" [size]="17" />
                      Add to cart
                    }
                  </button>

                  <button
                    type="button"
                    class="ob-btn ob-btn-brand w-full"
                    [disabled]="!p.inStock"
                    (click)="buyNow(p)"
                  >
                    Buy now
                  </button>

                  <button
                    type="button"
                    class="ob-btn ob-btn-ghost w-full"
                    [attr.aria-pressed]="saved()"
                    (click)="wishlist.toggle(p.id, p.name)"
                  >
                    <ob-icon name="heart" [size]="16" [class.text-pop]="saved()" />
                    {{ saved() ? 'Saved to wishlist' : 'Add to wishlist' }}
                  </button>
                </div>

                @if (inCart() > 0) {
                  <p class="mt-3 rounded-lg bg-teal-soft px-3 py-2 text-xs font-semibold text-teal">
                    {{ inCart() }} already in your <a routerLink="/cart" class="underline">cart</a>.
                  </p>
                }

                <hr class="my-4 border-line" />

                <ul class="space-y-2.5 text-xs text-muted">
                  @for (assurance of assurances; track assurance.label) {
                    <li class="flex items-start gap-2.5">
                      <ob-icon
                        [name]="assurance.icon"
                        [size]="15"
                        class="mt-px shrink-0 text-brand"
                      />
                      <span>{{ assurance.label }}</span>
                    </li>
                  }
                </ul>
              </div>
            </aside>
          </div>

          <!-- ==================================================== tabs -->
          <section id="reviews" class="mt-10 scroll-mt-36">
            <div
              class="ob-noscroll flex gap-1 overflow-x-auto border-b border-line"
              role="tablist"
              aria-label="Product information"
            >
              @for (tab of tabs; track tab.id) {
                <button
                  type="button"
                  role="tab"
                  class="-mb-px shrink-0 border-b-2 px-4 py-3 text-sm font-bold whitespace-nowrap transition"
                  [class]="
                    activeTab() === tab.id
                      ? 'border-[color:var(--cat-accent)] text-[color:var(--cat-accent-dark)]'
                      : 'border-transparent text-muted hover:text-body'
                  "
                  [attr.aria-selected]="activeTab() === tab.id"
                  [attr.id]="'tab-' + tab.id"
                  [attr.aria-controls]="'panel-' + tab.id"
                  (click)="selectTab(tab.id)"
                >
                  {{ tab.label }}
                  @if (tab.id === 'reviews') {
                    <span class="ml-1 text-xs font-semibold text-muted">({{ p.ratingCount }})</span>
                  }
                </button>
              }
            </div>

            <div class="py-6">
              @switch (activeTab()) {
                @case ('description') {
                  <div
                    role="tabpanel"
                    id="panel-description"
                    aria-labelledby="tab-description"
                    class="grid gap-8 lg:grid-cols-[minmax(0,42rem)_1fr]"
                  >
                    <div>
                      @for (paragraph of paragraphs(); track $index) {
                        <p class="mb-4 text-sm leading-7 text-body/90">{{ paragraph }}</p>
                      }
                    </div>
                    @if (p.tags.length) {
                      <div>
                        <h3 class="mb-3 text-xs font-extrabold tracking-wider text-muted uppercase">
                          Related searches
                        </h3>
                        <div class="flex flex-wrap gap-2">
                          @for (tag of p.tags; track tag) {
                            <a
                              routerLink="/search"
                              [queryParams]="{ q: tag }"
                              class="ob-chip transition hover:border-brand hover:bg-brand-soft"
                              >{{ tag }}</a
                            >
                          }
                        </div>
                      </div>
                    }
                  </div>
                }
                @case ('specifications') {
                  <div
                    role="tabpanel"
                    id="panel-specifications"
                    aria-labelledby="tab-specifications"
                    class="max-w-2xl"
                  >
                    <dl class="overflow-hidden rounded-xl border border-line">
                      @for (spec of specs(); track spec.key; let even = $even) {
                        <div
                          class="grid grid-cols-[9rem_1fr] gap-4 px-4 py-3 text-sm sm:grid-cols-[14rem_1fr]"
                          [class]="even ? 'bg-line-soft' : 'bg-surface'"
                        >
                          <dt class="font-semibold text-muted">{{ spec.key }}</dt>
                          <dd class="font-medium">{{ spec.value }}</dd>
                        </div>
                      } @empty {
                        <div class="px-4 py-6 text-sm text-muted">
                          No specifications published for this product.
                        </div>
                      }
                    </dl>
                  </div>
                }
                @case ('reviews') {
                  <div role="tabpanel" id="panel-reviews" aria-labelledby="tab-reviews">
                    <ob-reviews-panel
                      [slug]="p.slug"
                      [catalogRating]="p.rating"
                      [catalogCount]="p.ratingCount"
                    />
                  </div>
                }
              }
            </div>
          </section>

          <!-- ================================================= related -->
          @if (related().length) {
            @defer (on viewport) {
              <div class="mt-6 border-t border-line pt-8">
                <ob-product-rail
                  title="Customers also viewed"
                  [subtitle]="'More from ' + (p.subcategory?.name ?? p.category.name)"
                  [products]="related()"
                  [seeAllLink]="relatedLink()"
                />
              </div>
            } @placeholder {
              <div class="mt-6 border-t border-line pt-8">
                <ob-skeleton variant="rail" [count]="6" />
              </div>
            }
          }
        </div>
      </div>
    } @else {
      <div class="ob-container">
        <ob-empty-state
          art="package"
          title="We couldn't find that product"
          message="It may have sold out for good, or the link might be wrong."
        >
          <a routerLink="/" class="ob-btn ob-btn-brand">Back to home</a>
          <a routerLink="/search" class="ob-btn ob-btn-ghost">Browse the catalogue</a>
        </ob-empty-state>
      </div>
    }
  `,
})
export class ProductComponent {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  private readonly catalog = inject(CatalogStore);
  private readonly cart = inject(CartService);
  protected readonly wishlist = inject(WishlistService);

  protected readonly badgeStyle = badgeStyle;
  protected readonly loading = signal(true);
  protected readonly qty = signal(1);
  protected readonly activeTab = signal<Tab>('description');

  protected readonly tabs: { id: Tab; label: string }[] = [
    { id: 'description', label: 'Description' },
    { id: 'specifications', label: 'Specifications' },
    { id: 'reviews', label: 'Reviews' },
  ];

  protected readonly assurances = [
    { icon: 'rotate-ccw', label: '30-day returns — send it back for any reason.' },
    { icon: 'shield-check', label: 'Two-year warranty against manufacturing faults.' },
    { icon: 'lock', label: 'Secure checkout by card or Orbit E-Wallet.' },
    { icon: 'package', label: 'Dispatched from the Cairo warehouse.' },
  ];

  private readonly response = toSignal(
    this.route.paramMap.pipe(
      map((params) => params.get('slug') ?? ''),
      tap(() => {
        this.loading.set(true);
        this.qty.set(1);
        this.activeTab.set('description');
      }),
      switchMap((slug) => this.api.product(slug).pipe(catchError(() => of(null)))),
      tap((res) => {
        this.loading.set(false);
        if (res) this.title.setTitle(`${res.product.name} — Orbit Bazaar`);
        else this.title.setTitle('Product not found — Orbit Bazaar');
      }),
    ),
    { initialValue: null as ProductDetailResponse | null },
  );

  protected readonly product = computed<Product | null>(() => this.response()?.product ?? null);
  protected readonly related = computed<ProductCard[]>(() => this.response()?.related ?? []);

  protected readonly accent = computed(
    () => this.catalog.find(this.product()?.category.slug ?? '')?.accent ?? null,
  );

  protected readonly relatedLink = computed<string[]>(() => {
    const product = this.product();
    if (!product) return ['/search'];
    return product.subcategory
      ? ['/c', product.category.slug, product.subcategory.slug]
      : ['/c', product.category.slug];
  });

  protected readonly stock = computed(() => stockLabel(this.product()?.stock ?? 0));

  protected readonly saved = computed(() => {
    const product = this.product();
    return product ? this.wishlist.has(product.id) : false;
  });

  protected readonly adding = computed(() => {
    const product = this.product();
    return product ? this.cart.isPending(product.id) : false;
  });

  protected readonly inCart = computed(() => {
    const product = this.product();
    return product ? this.cart.qtyOf(product.id) : 0;
  });

  protected readonly delivery = computed(() =>
    deliveryEstimate(this.product() ?? { id: 'unknown', freeShipping: false }),
  );

  protected readonly paragraphs = computed(() =>
    (this.product()?.description ?? '').split('\n\n').filter(Boolean),
  );

  protected readonly specs = computed(() =>
    Object.entries(this.product()?.specs ?? {}).map(([key, value]) => ({ key, value })),
  );

  protected selectTab(tab: Tab): void {
    this.activeTab.set(tab);
  }

  protected addToCart(product: Product): void {
    this.cart.add(this.asCard(product), this.qty());
  }

  protected buyNow(product: Product): void {
    this.cart.add(this.asCard(product), this.qty());
    void this.router.navigate(['/cart']);
  }

  /**
   * The cart store works in `ProductCard`s; the detail DTO carries every field
   * a card needs bar the flattened `image`, so this is a widening.
   */
  private asCard(product: Product): ProductCard {
    return { ...product, image: product.images[0] ?? null };
  }
}
