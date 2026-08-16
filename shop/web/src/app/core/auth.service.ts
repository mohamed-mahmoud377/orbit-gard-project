import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, switchMap, tap } from 'rxjs';
import { ApiService } from './api.service';
import { CartService } from './cart.service';
import { TokenStore } from './token-store';
import { WishlistService } from './wishlist.service';
import { AuthResponse, User } from './models';

/**
 * Signal-based session store. The JWT lives in `localStorage` via
 * `TokenStore`; nothing else about the session is persisted.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly tokens = inject(TokenStore);
  private readonly cart = inject(CartService);
  private readonly wishlist = inject(WishlistService);

  readonly user = signal<User | null>(null);
  /** True until the initial `/auth/me` round-trip settles. */
  readonly restoring = signal(false);

  readonly isAuthenticated = computed(() => this.user() !== null);
  readonly initials = computed(() => {
    const name = this.user()?.name ?? '';
    return (
      name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('') || 'OB'
    );
  });

  /** Called once at bootstrap: revive a stored session if the token is good. */
  restore(): void {
    if (!this.tokens.token()) {
      this.cart.refresh();
      return;
    }
    this.restoring.set(true);
    this.api.me().subscribe({
      next: (res) => {
        this.user.set(res.user);
        this.restoring.set(false);
        this.cart.refresh();
        this.wishlist.refresh();
      },
      error: () => {
        // Expired or tampered token — drop it and carry on as a guest.
        this.tokens.clear();
        this.user.set(null);
        this.restoring.set(false);
      },
    });
  }

  login(email: string, password: string): Observable<unknown> {
    return this.api.login({ email, password }).pipe(switchMap((res) => this.adopt(res)));
  }

  register(name: string, email: string, password: string): Observable<unknown> {
    return this.api.register({ name, email, password }).pipe(switchMap((res) => this.adopt(res)));
  }

  logout(): void {
    this.tokens.clear();
    this.user.set(null);
    this.wishlist.clearLocal();
    this.cart.resetToGuest().subscribe();
  }

  /**
   * Store the session, then merge the guest cart (CONTRACT §9) before the
   * caller navigates on — so the cart badge is already correct on arrival.
   */
  private adopt(res: AuthResponse): Observable<unknown> {
    this.tokens.set(res.token);
    this.user.set(res.user);
    this.wishlist.refresh();
    return this.cart.mergeGuestCart().pipe(tap(() => undefined));
  }
}
