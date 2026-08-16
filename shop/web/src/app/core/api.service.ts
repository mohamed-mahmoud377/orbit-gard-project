import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Address,
  AddressInput,
  AuthResponse,
  Cart,
  CardPaymentInput,
  CategoriesResponse,
  GuestCartLine,
  HomeResponse,
  MeResponse,
  OrbitVerifyResponse,
  OrderResponse,
  OrdersResponse,
  PaymentResultResponse,
  ProductDetailResponse,
  ProductQuery,
  ProductSearchResponse,
  Review,
  ReviewsResponse,
  ShippingMethod,
  WishlistResponse,
} from './models';

/** The API is mounted at `/shop/api` and served from the same origin. */
const BASE = '/shop/api';

/**
 * Thin, fully-typed wrappers over the shop API. No business logic lives here —
 * the signal stores (`CartService`, `AuthService`, …) own that.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  /* --------------------------------------------------------------- catalog */

  categories(): Observable<CategoriesResponse> {
    return this.http.get<CategoriesResponse>(`${BASE}/categories`);
  }

  home(): Observable<HomeResponse> {
    return this.http.get<HomeResponse>(`${BASE}/home`);
  }

  products(query: ProductQuery): Observable<ProductSearchResponse> {
    return this.http.get<ProductSearchResponse>(`${BASE}/products`, {
      params: toParams(query),
    });
  }

  product(slug: string): Observable<ProductDetailResponse> {
    return this.http.get<ProductDetailResponse>(`${BASE}/products/${encodeURIComponent(slug)}`);
  }

  reviews(slug: string, page = 1, pageSize = 10): Observable<ReviewsResponse> {
    return this.http.get<ReviewsResponse>(`${BASE}/products/${encodeURIComponent(slug)}/reviews`, {
      params: new HttpParams().set('page', page).set('pageSize', pageSize),
    });
  }

  createReview(
    slug: string,
    body: { rating: number; title?: string; body?: string },
  ): Observable<{ review: Review }> {
    return this.http.post<{ review: Review }>(
      `${BASE}/products/${encodeURIComponent(slug)}/reviews`,
      body,
    );
  }

  /* ------------------------------------------------------------------ auth */

  register(body: { name: string; email: string; password: string }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${BASE}/auth/register`, body);
  }

  login(body: { email: string; password: string }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${BASE}/auth/login`, body);
  }

  me(): Observable<MeResponse> {
    return this.http.get<MeResponse>(`${BASE}/auth/me`);
  }

  changePassword(body: { currentPassword: string; newPassword: string }): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${BASE}/auth/change-password`, body);
  }

  /* ------------------------------------------------------------------ cart */

  cart(shippingMethod: ShippingMethod = 'standard'): Observable<Cart> {
    return this.http.get<Cart>(`${BASE}/cart`, {
      params: new HttpParams().set('shippingMethod', shippingMethod),
    });
  }

  addToCart(productId: string, qty = 1): Observable<Cart> {
    return this.http.post<Cart>(`${BASE}/cart/items`, { productId, qty });
  }

  setCartQty(productId: string, qty: number): Observable<Cart> {
    return this.http.patch<Cart>(`${BASE}/cart/items/${productId}`, { qty });
  }

  removeCartItem(productId: string): Observable<Cart> {
    return this.http.delete<Cart>(`${BASE}/cart/items/${productId}`);
  }

  clearCart(): Observable<Cart> {
    return this.http.delete<Cart>(`${BASE}/cart`);
  }

  mergeCart(items: GuestCartLine[]): Observable<Cart> {
    return this.http.post<Cart>(`${BASE}/cart/merge`, { items });
  }

  /* -------------------------------------------------------------- wishlist */

  wishlist(): Observable<WishlistResponse> {
    return this.http.get<WishlistResponse>(`${BASE}/wishlist`);
  }

  addToWishlist(productId: string): Observable<WishlistResponse> {
    return this.http.post<WishlistResponse>(`${BASE}/wishlist`, { productId });
  }

  removeFromWishlist(productId: string): Observable<WishlistResponse> {
    return this.http.delete<WishlistResponse>(`${BASE}/wishlist/${productId}`);
  }

  /* ------------------------------------------------------------- addresses */

  addresses(): Observable<{ items: Address[] }> {
    return this.http.get<{ items: Address[] }>(`${BASE}/addresses`);
  }

  createAddress(body: AddressInput): Observable<{ address: Address }> {
    return this.http.post<{ address: Address }>(`${BASE}/addresses`, body);
  }

  updateAddress(id: string, body: Partial<AddressInput>): Observable<{ address: Address }> {
    return this.http.patch<{ address: Address }>(`${BASE}/addresses/${id}`, body);
  }

  deleteAddress(id: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${BASE}/addresses/${id}`);
  }

  /* ---------------------------------------------------------------- orders */

  createOrder(body: { addressId: string; shippingMethod: ShippingMethod }): Observable<OrderResponse> {
    return this.http.post<OrderResponse>(`${BASE}/orders`, body);
  }

  orders(): Observable<OrdersResponse> {
    return this.http.get<OrdersResponse>(`${BASE}/orders`);
  }

  order(id: string): Observable<OrderResponse> {
    return this.http.get<OrderResponse>(`${BASE}/orders/${id}`);
  }

  /* -------------------------------------------------------------- payments */

  payWithCard(orderId: string, body: CardPaymentInput): Observable<PaymentResultResponse> {
    return this.http.post<PaymentResultResponse>(`${BASE}/orders/${orderId}/pay/card`, body);
  }

  /**
   * CONTRACT §8 step 1. The password is posted exactly once and the resulting
   * Orbit token stays server-side — only a `sessionId` comes back.
   */
  orbitVerify(
    orderId: string,
    body: { username: string; password: string },
  ): Observable<OrbitVerifyResponse> {
    return this.http.post<OrbitVerifyResponse>(`${BASE}/orders/${orderId}/pay/orbit/verify`, body);
  }

  /** CONTRACT §8 step 2. Only the session id is sent. */
  orbitConfirm(orderId: string, sessionId: string): Observable<PaymentResultResponse> {
    return this.http.post<PaymentResultResponse>(`${BASE}/orders/${orderId}/pay/orbit/confirm`, {
      sessionId,
    });
  }
}

/** `brand` is repeatable; empty/undefined values are dropped entirely. */
function toParams(query: ProductQuery): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const entry of value) params = params.append(key, String(entry));
    } else {
      params = params.set(key, String(value));
    }
  }
  return params;
}
