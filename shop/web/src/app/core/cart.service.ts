import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, of, tap } from 'rxjs';
import { ApiService } from './api.service';
import { ApiError } from './api-error';
import { ToastService } from './toast.service';
import { TokenStore } from './token-store';
import { Cart, CartLine, GuestCartLine, ProductCard, ShippingMethod } from './models';
import { buildLines, computeTotals } from './pricing';

const GUEST_KEY = 'ob.cart';
const MAX_QTY = 20;

/** What we keep in `localStorage` — the snapshot lets a guest cart render offline. */
interface GuestEntry {
  productId: string;
  qty: number;
  product: ProductCard;
}

const EMPTY_CART: Cart = {
  items: [],
  subtotalCents: 0,
  shippingCents: 0,
  taxCents: 0,
  totalCents: 0,
  itemCount: 0,
  shippingMethod: 'standard',
};

/**
 * The one cart store.
 *
 * Signed in  → the server cart is the source of truth.
 * Guest      → lines live in `localStorage` under `ob.cart` (CONTRACT §9) and
 *              totals are computed locally with the same rules as the API.
 *              On login/register the guest lines are POSTed to `/cart/merge`.
 */
@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly tokens = inject(TokenStore);

  private readonly serverCart = signal<Cart | null>(null);
  private readonly guestEntries = signal<GuestEntry[]>(readGuestCart());

  readonly loading = signal(false);
  readonly shippingMethod = signal<ShippingMethod>('standard');
  /** Product ids with an in-flight mutation, so buttons can show a busy state. */
  readonly pending = signal<ReadonlySet<string>>(new Set());

  readonly isGuest = computed(() => !this.tokens.token());

  readonly cart = computed<Cart>(() => {
    if (!this.isGuest()) return this.serverCart() ?? EMPTY_CART;
    const entries = this.guestEntries();
    const items: CartLine[] = buildLines(entries);
    const totals = computeTotals(entries, this.shippingMethod());
    return { items, ...totals, shippingMethod: this.shippingMethod() };
  });

  readonly itemCount = computed(() => this.cart().itemCount);
  readonly isEmpty = computed(() => this.cart().items.length === 0);

  /**
   * True between "signed in" and "the server cart has arrived". Without this,
   * a hard refresh onto /cart flashes the empty state before the real cart
   * lands — which reads as "you lost your basket".
   */
  readonly initialising = computed(() => !this.isGuest() && this.serverCart() === null);
  readonly lineFor = computed(() => {
    const map = new Map<string, CartLine>();
    for (const line of this.cart().items) map.set(line.product.id, line);
    return map;
  });

  qtyOf(productId: string): number {
    return this.lineFor().get(productId)?.qty ?? 0;
  }

  isPending(productId: string): boolean {
    return this.pending().has(productId);
  }

  /* ------------------------------------------------------------- loading */

  refresh(): void {
    if (this.isGuest()) return;
    this.loading.set(true);
    this.api.cart(this.shippingMethod()).subscribe({
      next: (cart) => {
        this.serverCart.set(cart);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  setShippingMethod(method: ShippingMethod): void {
    this.shippingMethod.set(method);
    if (!this.isGuest()) this.refresh();
  }

  /* ------------------------------------------------------------ mutations */

  add(product: ProductCard, qty = 1): void {
    if (this.isGuest()) {
      this.guestEntries.update((entries) => {
        const existing = entries.find((e) => e.productId === product.id);
        const next = existing
          ? entries.map((e) =>
              e.productId === product.id
                ? { ...e, qty: Math.min(MAX_QTY, e.qty + qty), product }
                : e,
            )
          : [...entries, { productId: product.id, qty: Math.min(MAX_QTY, qty), product }];
        writeGuestCart(next);
        return next;
      });
      this.toast.success('Added to cart', `${product.name} · ${qty} item${qty === 1 ? '' : 's'}`);
      return;
    }

    this.mark(product.id, true);
    this.api.addToCart(product.id, qty).subscribe({
      next: (cart) => {
        this.serverCart.set(cart);
        this.mark(product.id, false);
        this.toast.success('Added to cart', `${product.name} · ${qty} item${qty === 1 ? '' : 's'}`);
      },
      error: (err: ApiError) => {
        this.mark(product.id, false);
        this.toast.error("Couldn't add that item", err.message);
      },
    });
  }

  setQty(productId: string, qty: number): void {
    const bounded = Math.max(0, Math.min(MAX_QTY, qty));
    if (this.isGuest()) {
      this.guestEntries.update((entries) => {
        const next =
          bounded === 0
            ? entries.filter((e) => e.productId !== productId)
            : entries.map((e) => (e.productId === productId ? { ...e, qty: bounded } : e));
        writeGuestCart(next);
        return next;
      });
      return;
    }

    this.mark(productId, true);
    this.api.setCartQty(productId, bounded).subscribe({
      next: (cart) => {
        this.serverCart.set(cart);
        this.mark(productId, false);
      },
      error: (err: ApiError) => {
        this.mark(productId, false);
        this.toast.error("Couldn't update the quantity", err.message);
      },
    });
  }

  /**
   * Remove a line, offering an undo. The undo re-adds the exact quantity, so
   * a mis-click never costs the shopper their basket.
   */
  remove(line: CartLine): void {
    const { product, qty } = line;
    const restore = () => this.add(product, qty);

    if (this.isGuest()) {
      this.guestEntries.update((entries) => {
        const next = entries.filter((e) => e.productId !== product.id);
        writeGuestCart(next);
        return next;
      });
      this.toast.info('Removed from cart', product.name, { label: 'Undo', run: restore });
      return;
    }

    this.mark(product.id, true);
    this.api.removeCartItem(product.id).subscribe({
      next: (cart) => {
        this.serverCart.set(cart);
        this.mark(product.id, false);
        this.toast.info('Removed from cart', product.name, { label: 'Undo', run: restore });
      },
      error: (err: ApiError) => {
        this.mark(product.id, false);
        this.toast.error("Couldn't remove that item", err.message);
      },
    });
  }

  clear(): void {
    if (this.isGuest()) {
      this.guestEntries.set([]);
      writeGuestCart([]);
      return;
    }
    this.api.clearCart().subscribe({
      next: (cart) => this.serverCart.set(cart),
      error: (err: ApiError) => this.toast.error("Couldn't empty your cart", err.message),
    });
  }

  /* --------------------------------------------------------------- merge */

  /**
   * Adopt the guest cart after login/register (CONTRACT §9). Only
   * `{productId, qty}` goes over the wire; the local snapshot is dropped
   * whatever the outcome so a stale basket can never resurrect itself.
   */
  mergeGuestCart(): Observable<Cart> {
    const lines: GuestCartLine[] = this.guestEntries().map((e) => ({
      productId: e.productId,
      qty: e.qty,
    }));
    this.guestEntries.set([]);
    writeGuestCart([]);

    if (lines.length === 0) {
      return this.api.cart(this.shippingMethod()).pipe(tap((cart) => this.serverCart.set(cart)));
    }
    return this.api.mergeCart(lines).pipe(tap((cart) => this.serverCart.set(cart)));
  }

  /** Called on sign-out: the server cart is not ours any more. */
  resetToGuest(): Observable<null> {
    this.serverCart.set(null);
    this.guestEntries.set([]);
    writeGuestCart([]);
    return of(null);
  }

  private mark(productId: string, busy: boolean): void {
    this.pending.update((set) => {
      const next = new Set(set);
      if (busy) next.add(productId);
      else next.delete(productId);
      return next;
    });
  }
}

function readGuestCart(): GuestEntry[] {
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isGuestEntry);
  } catch {
    return [];
  }
}

function writeGuestCart(entries: GuestEntry[]): void {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify(entries));
  } catch {
    /* storage unavailable — the in-memory signal is still authoritative */
  }
}

function isGuestEntry(value: unknown): value is GuestEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Partial<GuestEntry>;
  return (
    typeof entry.productId === 'string' &&
    typeof entry.qty === 'number' &&
    entry.qty > 0 &&
    typeof entry.product === 'object' &&
    entry.product !== null &&
    typeof entry.product.priceCents === 'number'
  );
}
