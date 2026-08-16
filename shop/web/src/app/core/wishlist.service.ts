import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { ApiError } from './api-error';
import { ToastService } from './toast.service';
import { TokenStore } from './token-store';
import { WishlistEntry } from './models';

/**
 * Signal store for the wishlist.
 *
 * The wishlist is auth-only server-side, so for guests we keep an optimistic
 * local id set purely so the heart icon can render a "saved" state after the
 * user signs in; nothing is persisted for guests.
 */
@Injectable({ providedIn: 'root' })
export class WishlistService {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly tokens = inject(TokenStore);

  readonly items = signal<WishlistEntry[]>([]);
  readonly loading = signal(false);

  readonly count = computed(() => this.items().length);
  readonly ids = computed(() => new Set(this.items().map((entry) => entry.product.id)));

  has(productId: string): boolean {
    return this.ids().has(productId);
  }

  refresh(): void {
    if (!this.tokens.token()) {
      this.items.set([]);
      return;
    }
    this.loading.set(true);
    this.api.wishlist().subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  clearLocal(): void {
    this.items.set([]);
  }

  /** @returns true when the product ended up saved. */
  toggle(productId: string, productName: string): void {
    if (!this.tokens.token()) {
      this.toast.info('Sign in to save items', 'Your wishlist follows you across devices.');
      return;
    }
    const saved = this.has(productId);
    const request = saved
      ? this.api.removeFromWishlist(productId)
      : this.api.addToWishlist(productId);

    request.subscribe({
      next: (res) => {
        this.items.set(res.items);
        if (saved) this.toast.info('Removed from wishlist', productName);
        else this.toast.success('Saved to wishlist', productName);
      },
      error: (err: ApiError) => this.toast.error("Couldn't update your wishlist", err.message),
    });
  }
}
