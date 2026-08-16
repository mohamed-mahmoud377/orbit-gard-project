/**
 * Wire models for the Jerry's Shop API (CONTRACT §3, §5, §6, §7, §8).
 *
 * These mirror the DTOs produced by `shop/api/src/services/*.js` exactly.
 * Money is always integer minor units (piastres); anything ending in `Cents`
 * is an integer, never a float.
 */

export type Badge = 'BEST_SELLER' | 'NEW' | 'DEAL' | 'LIMITED';

export type SortKey = 'relevance' | 'newest' | 'price_asc' | 'price_desc' | 'rating' | 'popular';

export type ShippingMethod = 'standard' | 'express';

export interface CategoryRef {
  slug: string;
  name: string;
}

export interface Subcategory {
  id: string;
  slug: string;
  name: string;
  productCount: number;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  icon: string | null;
  accent: string | null;
  heroImage: string | null;
  productCount: number;
  subcategories: Subcategory[];
}

export interface CategoriesResponse {
  items: Category[];
}

/** Fields shared by the card DTO and the full product DTO. */
export interface ProductBase {
  id: string;
  slug: string;
  name: string;
  brand: string;
  category: CategoryRef;
  subcategory: CategoryRef | null;
  priceCents: number;
  listPriceCents: number | null;
  discountPercent: number;
  rating: number;
  ratingCount: number;
  stock: number;
  inStock: boolean;
  badges: Badge[];
  shortDescription: string;
  images: string[];
  freeShipping: boolean;
  createdAt: string;
}

/** `toProductCard` — grids, rails, cart lines, wishlists. */
export interface ProductCard extends ProductBase {
  image: string | null;
}

/** `toProduct` — the product detail page. */
export interface Product extends ProductBase {
  sku: string;
  description: string;
  features: string[];
  specs: Record<string, string>;
  tags: string[];
}

export interface FacetValue {
  value: string;
  count: number;
}

export interface RatingFacet {
  value: number;
  count: number;
}

export interface Facets {
  brands: FacetValue[];
  priceRange: { minCents: number; maxCents: number };
  ratings: RatingFacet[];
}

export interface ProductSearchResponse {
  items: ProductCard[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  facets: Facets;
}

export interface ProductDetailResponse {
  product: Product;
  related: ProductCard[];
}

/** Query for `GET /products`. Repeatable `brand`. */
export interface ProductQuery {
  q?: string;
  category?: string;
  subcategory?: string;
  brand?: string[];
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  badge?: Badge;
  inStock?: boolean;
  sort?: SortKey;
  page?: number;
  pageSize?: number;
}

export interface HeroSlide {
  categorySlug: string;
  title: string;
  tagline: string | null;
  image: string | null;
  accent: string | null;
  icon: string | null;
  href: string;
}

export interface CategoryRail {
  category: { slug: string; name: string; tagline: string | null; icon: string | null; accent: string | null };
  products: ProductCard[];
}

export interface HomeResponse {
  heroSlides: HeroSlide[];
  dealsOfTheDay: ProductCard[];
  newArrivals: ProductCard[];
  bestSellers: ProductCard[];
  categoryRails: CategoryRail[];
}

/* ------------------------------------------------------------------ auth */

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface MeResponse {
  user: User;
}

/* ------------------------------------------------------------------ cart */

export interface CartLine {
  product: ProductCard;
  qty: number;
  lineTotalCents: number;
  exceedsStock: boolean;
}

export interface Cart {
  items: CartLine[];
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  itemCount: number;
  shippingMethod: ShippingMethod;
}

/** A guest cart line as persisted in `localStorage` under `ob.cart`. */
export interface GuestCartLine {
  productId: string;
  qty: number;
}

/* -------------------------------------------------------------- wishlist */

export interface WishlistEntry {
  product: ProductCard;
  addedAt: string;
}

export interface WishlistResponse {
  items: WishlistEntry[];
  total: number;
}

/* ------------------------------------------------------------- addresses */

export interface Address {
  id: string;
  label: string | null;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  governorate: string;
  postalCode: string | null;
  isDefault: boolean;
  createdAt: string;
}

export interface AddressInput {
  label?: string;
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  governorate: string;
  postalCode?: string;
  isDefault?: boolean;
}

/* --------------------------------------------------------------- reviews */

export interface Review {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  author: string;
  createdAt: string;
}

export interface ReviewSummary {
  average: number;
  counts: Record<string, number>;
}

export interface ReviewsResponse {
  items: Review[];
  page: number;
  pageSize: number;
  total: number;
  summary: ReviewSummary;
}

/* ---------------------------------------------------------------- orders */

export type OrderStatus =
  | 'PENDING'
  | 'PAID'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'NEEDS_REVIEW';

export type PaymentStatus = 'UNPAID' | 'PAID' | 'FAILED' | 'UNCERTAIN';

export type PaymentMethod = 'CARD' | 'ORBIT_WALLET';

export interface OrderItem {
  id: string;
  productId: string;
  name: string;
  slug: string;
  image: string | null;
  unitPriceCents: number;
  qty: number;
  lineTotalCents: number;
}

export interface Payment {
  id: string;
  method: PaymentMethod;
  status: 'APPROVED' | 'DECLINED' | 'ERROR';
  amountCents: number;
  cardLast4: string | null;
  cardBrand: string | null;
  authCode: string | null;
  orbitTransactionId: string | null;
  orbitReference: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
}

export interface ShippingAddressSnapshot {
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  governorate: string;
  postalCode: string | null;
}

export interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | null;
  shippingMethod: ShippingMethod;
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
  itemCount?: number;
  shippingAddress: ShippingAddressSnapshot;
  placedAt: string;
  paidAt: string | null;
  items?: OrderItem[];
  payment?: Payment | null;
}

export interface OrderResponse {
  order: Order;
}

export interface OrdersResponse {
  items: Order[];
}

export interface PaymentResultResponse {
  order: Order;
  payment: Payment;
}

/* -------------------------------------------------------------- payments */

export interface CardPaymentInput {
  cardNumber: string;
  holderName: string;
  expMonth: number;
  expYear: number;
  cvv: string;
}

/** CONTRACT §8 step 1. Note: no token ever reaches the browser. */
export interface OrbitVerifyResponse {
  sessionId: string;
  maskedUsername: string;
  expiresAt: string;
  amountCents: number;
}

/* ---------------------------------------------------------------- errors */

/** Details bag from CONTRACT §5. */
export interface ApiErrorDetails {
  fieldErrors?: Record<string, string>;
  requiredCents?: number;
  sessionRetryable?: boolean;
  expiresAt?: string;
  items?: { productId: string; slug: string; name: string; requested: number; available: number }[];
}
