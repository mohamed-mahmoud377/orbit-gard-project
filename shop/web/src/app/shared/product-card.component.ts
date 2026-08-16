import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CartService } from '../core/cart.service';
import { ProductCard } from '../core/models';
import { WishlistService } from '../core/wishlist.service';
import { IconComponent } from './icon.component';
import { ImgFallbackDirective } from './img-fallback.directive';
import { MoneyPipe } from './money.pipe';
import { PriceComponent } from './price.component';
import { StarRatingComponent } from './star-rating.component';
import { badgeStyle, primaryImage, stockLabel } from './product-utils';

/**
 * The product tile. One component serves the grid and the list view so a
 * shopper toggling the layout never sees two different sets of facts.
 */
@Component({
  selector: 'ob-product-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    IconComponent,
    ImgFallbackDirective,
    PriceComponent,
    StarRatingComponent,
    MoneyPipe,
  ],
  host: { class: 'block' },
  template: `
    <article
      class="group relative flex h-full overflow-hidden rounded-2xl border border-line bg-surface transition duration-200 hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-[var(--shadow-lift)]"
      [class]="layout() === 'list' ? 'flex-row gap-4 p-3 sm:gap-5 sm:p-4' : 'flex-col'"
    >
      <!-- media ------------------------------------------------------- -->
      <a
        [routerLink]="['/p', product().slug]"
        class="ob-media block shrink-0 bg-line-soft"
        [class]="
          layout() === 'list'
            ? 'aspect-square w-28 rounded-xl sm:w-40'
            : 'aspect-square w-full rounded-t-2xl'
        "
        [attr.aria-label]="product().name"
        tabindex="-1"
      >
        <img
          [src]="image()"
          [alt]="product().name"
          [obImgFallback]="product().name"
          [eager]="eager()"
          class="transition-transform duration-500 group-hover:scale-[1.04]"
        />
        @if (!product().inStock) {
          <span
            class="absolute inset-0 grid place-items-center bg-ink/45 text-xs font-bold tracking-wide text-white uppercase"
          >
            Out of stock
          </span>
        }
      </a>

      <!-- badges ------------------------------------------------------ -->
      @if (product().badges.length || product().discountPercent > 0) {
        <div
          class="pointer-events-none absolute flex flex-wrap gap-1"
          [class]="layout() === 'list' ? 'top-5 left-5' : 'top-3 left-3'"
        >
          @if (product().discountPercent > 0) {
            <span class="ob-badge bg-pop text-white shadow-sm"
              >-{{ product().discountPercent }}%</span
            >
          }
          @for (badge of product().badges.slice(0, 1); track badge) {
            <span class="ob-badge shadow-sm" [class]="badgeStyle(badge).classes">{{
              badgeStyle(badge).label
            }}</span>
          }
        </div>
      }

      <!-- wishlist ---------------------------------------------------- -->
      <button
        type="button"
        class="absolute z-10 grid size-9 place-items-center rounded-full border border-line bg-surface/95 text-muted shadow-sm backdrop-blur transition hover:scale-105 hover:text-pop"
        [class]="layout() === 'list' ? 'top-4 right-4' : 'top-3 right-3'"
        [class.text-pop]="saved()"
        [attr.aria-pressed]="saved()"
        [attr.aria-label]="(saved() ? 'Remove ' : 'Save ') + product().name + ' to wishlist'"
        (click)="toggleWishlist($event)"
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="1.9"
          stroke-linecap="round"
          stroke-linejoin="round"
          [attr.fill]="saved() ? 'currentColor' : 'none'"
          aria-hidden="true"
        >
          <svg:path
            d="M20.6 4.7a5.4 5.4 0 0 0-7.7 0L12 5.6l-.9-.9a5.4 5.4 0 1 0-7.7 7.7l8.6 8.6 8.6-8.6a5.4 5.4 0 0 0 0-7.7z"
          />
        </svg>
      </button>

      <!-- body -------------------------------------------------------- -->
      <div
        class="flex min-w-0 flex-1 flex-col"
        [class]="layout() === 'list' ? 'py-1' : 'gap-1.5 p-3.5'"
      >
        <p class="text-[11px] font-bold tracking-wider text-muted uppercase">
          {{ product().brand }}
        </p>

        <h3 class="text-sm leading-snug font-semibold text-body">
          <a
            [routerLink]="['/p', product().slug]"
            class="ob-clamp-2 transition hover:text-brand after:absolute after:inset-0 after:content-['']"
          >
            {{ product().name }}
          </a>
        </h3>

        @if (layout() === 'list') {
          <p class="ob-clamp-2 mt-1.5 text-[13px] leading-relaxed text-muted">
            {{ product().shortDescription }}
          </p>
        }

        <a
          [routerLink]="['/p', product().slug]"
          fragment="reviews"
          class="relative z-10 mt-1 -mb-0.5 flex w-fit items-center gap-1.5"
        >
          <ob-star-rating [rating]="product().rating" [count]="product().ratingCount" />
        </a>

        <div class="mt-1.5">
          <ob-price
            [cents]="product().priceCents"
            [listCents]="product().listPriceCents"
            [discountPercent]="product().discountPercent"
            [size]="layout() === 'list' ? 'lg' : 'md'"
          />
        </div>

        <div class="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] font-semibold">
          <span [class]="stock().tone">{{ stock().text }}</span>
          @if (product().freeShipping) {
            <span class="inline-flex items-center gap-1 text-muted">
              <ob-icon name="truck" [size]="13" />
              Free delivery
            </span>
          }
        </div>

        @if (layout() === 'list') {
          <p class="mt-1 text-[11px] text-muted">
            {{ product().category.name }}
            @if (product().subcategory) {
              · {{ product().subcategory!.name }}
            }
          </p>
        }

        <div class="mt-auto pt-3">
          <button
            type="button"
            class="ob-btn ob-btn-primary ob-btn-sm relative z-10 w-full"
            [class]="layout() === 'list' ? 'sm:w-auto sm:px-6' : ''"
            [disabled]="!product().inStock || busy()"
            (click)="addToCart($event)"
          >
            @if (busy()) {
              <ob-icon name="loader" [size]="15" class="ob-spin" />
              Adding…
            } @else {
              <ob-icon name="shopping-cart" [size]="15" />
              {{ inCart() > 0 ? 'In cart (' + inCart() + ')' : 'Add to cart' }}
            }
          </button>
        </div>
      </div>

      <span class="sr-only">Price {{ product().priceCents | money }}</span>
    </article>
  `,
})
export class ProductCardComponent {
  private readonly cart = inject(CartService);
  private readonly wishlist = inject(WishlistService);

  readonly product = input.required<ProductCard>();
  readonly layout = input<'grid' | 'list'>('grid');
  /** Set on above-the-fold tiles so their images are not lazy. */
  readonly eager = input(false);

  protected readonly badgeStyle = badgeStyle;

  protected readonly image = computed(() => primaryImage(this.product()));
  protected readonly stock = computed(() => stockLabel(this.product().stock));
  protected readonly saved = computed(() => this.wishlist.has(this.product().id));
  protected readonly busy = computed(() => this.cart.isPending(this.product().id));
  protected readonly inCart = computed(() => this.cart.qtyOf(this.product().id));

  protected addToCart(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.cart.add(this.product(), 1);
  }

  protected toggleWishlist(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.wishlist.toggle(this.product().id, this.product().name);
  }
}
