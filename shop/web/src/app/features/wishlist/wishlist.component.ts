import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CartService } from '../../core/cart.service';
import { WishlistService } from '../../core/wishlist.service';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { IconComponent } from '../../shared/icon.component';
import { ProductCardComponent } from '../../shared/product-card.component';
import { SkeletonComponent } from '../../shared/skeleton.component';

@Component({
  selector: 'ob-wishlist',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    DatePipe,
    EmptyStateComponent,
    IconComponent,
    ProductCardComponent,
    SkeletonComponent,
  ],
  host: { class: 'block' },
  template: `
    <div class="ob-container py-6">
      <div class="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl font-extrabold tracking-tight">Your wishlist</h1>
          <p class="mt-0.5 text-sm text-muted">
            {{ wishlist.count() }} saved {{ wishlist.count() === 1 ? 'product' : 'products' }}
          </p>
        </div>

        @if (inStockItems().length > 0) {
          <button type="button" class="ob-btn ob-btn-primary" (click)="addAll()">
            <ob-icon name="shopping-cart" [size]="16" />
            Add {{ inStockItems().length }} in-stock
            {{ inStockItems().length === 1 ? 'item' : 'items' }} to cart
          </button>
        }
      </div>

      @if (wishlist.loading() && wishlist.count() === 0) {
        <ob-skeleton variant="grid" [count]="8" />
      } @else if (wishlist.count() === 0) {
        <div class="ob-panel">
          <ob-empty-state
            art="heart"
            title="Nothing saved yet"
            message="Tap the heart on any product to keep it here for later."
          >
            <a routerLink="/" class="ob-btn ob-btn-primary">Find something to save</a>
          </ob-empty-state>
        </div>
      } @else {
        <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
          @for (entry of wishlist.items(); track entry.product.id) {
            <li>
              <ob-product-card [product]="entry.product" />
              <p class="mt-1.5 px-1 text-[11px] text-muted">
                Saved {{ entry.addedAt | date: 'mediumDate' }}
              </p>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class WishlistComponent {
  protected readonly wishlist = inject(WishlistService);
  private readonly cart = inject(CartService);

  constructor() {
    this.wishlist.refresh();
  }

  protected readonly inStockItems = computed(() =>
    this.wishlist.items().filter((entry) => entry.product.inStock),
  );

  protected addAll(): void {
    for (const entry of this.inStockItems()) this.cart.add(entry.product, 1);
  }
}
