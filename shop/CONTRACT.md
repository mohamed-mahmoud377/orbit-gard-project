# Jerry's Shop — build contract

This file is the single source of truth shared by `shop/api` (Node/Express) and
`shop/web` (Angular). Anything not written here is an implementation detail; anything
written here must not be changed by one side alone.

- Money is **always integer minor units (piastres)** on the wire and in the DB. Field
  names carrying money end in `Cents`. Only the Orbit payment call converts to major
  units, because the Orbit API takes a `BigDecimal`.
- Currency is **EGP** everywhere.
- All timestamps are ISO-8601 UTC strings.
- The API is mounted at **`/shop/api`**. The Angular app is served from **`/shop/`**.
  A single Node process serves both, so there is no CORS anywhere in the shop.

---

## 1. Runtime topology

```
browser ──▶ nginx (:80, orbit-web)
              ├── /orbit/   → Angular admin/banking SPA (existing)
              ├── /api/     → orbit-app:8080/api/   (existing Spring backend)
              └── /shop/    → orbit-shop:4000/shop/ (this app)
                                 │
                                 ├── serves Angular static bundle
                                 └── /shop/api/* Express routes
                                          │
                                          ├──▶ orbit-db:5432  database "shop"
                                          └──▶ orbit-app:8080/api/v1/external/*
```

The browser **never** talks to the Orbit banking API. Every Orbit call is
server-to-server from the shop API, which is what makes the missing CORS config a
non-issue and keeps wallet credentials off the client after the initial POST.

## 2. Environment variables (shop API)

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `4000` | HTTP port |
| `DATABASE_URL` | — | Postgres URL for the **`shop`** database |
| `BOOTSTRAP_DATABASE_URL` | — | Optional. URL to the `postgres` maintenance DB; used once at boot to `CREATE DATABASE shop` if missing |
| `ORBIT_API_BASE` | `http://app:8080/api/v1` | Base URL of the Spring backend |
| `ORBIT_MERCHANT_NAME` | `Jerry's Shop` | Sent as `merchantName`; max 255 chars |
| `ORBIT_TIMEOUT_MS` | `15000` | Per-request timeout for Orbit calls |
| `JWT_SECRET` | dev fallback | Signs shop session tokens |
| `SEED_ON_BOOT` | `true` | Seed catalog if the products table is empty |
| `LOG_LEVEL` | `info` | |

The `shop` database lives inside the **existing** `orbit-db` container. The Postgres
volume on the server already exists, so `docker-entrypoint-initdb.d` scripts will
never run — the API must create the database itself at boot via
`BOOTSTRAP_DATABASE_URL`. This is required, not optional.

## 3. Catalog JSON

Generated at build time into `shop/api/src/catalog/catalog.json` and committed.
Seeded into Postgres on first boot.

```jsonc
{
  "version": 1,
  "currency": "EGP",
  "categories": [
    {
      "slug": "electronics",
      "name": "Electronics",
      "tagline": "Tech that keeps up with you",
      "icon": "laptop",                  // lucide-style name, rendered as inline SVG
      "accent": "indigo",                // tailwind palette key for category theming
      "heroImage": "https://cdn.stocksnap.io/img-thumbs/960w/XXXX.jpg",
      "subcategories": [
        { "slug": "laptops", "name": "Laptops & Ultrabooks" }
      ]
    }
  ],
  "products": [
    {
      "id": "p-00042",
      "slug": "aurora-x14-ultrabook-16gb",
      "name": "Aurora X14 Ultrabook 16GB",
      "brand": "Aurora",
      "categorySlug": "electronics",
      "subcategorySlug": "laptops",
      "priceCents": 4599900,             // what the customer pays
      "listPriceCents": 5299900,         // struck-through price; null when no discount
      "rating": 4.6,                     // 1 decimal, 3.2–5.0
      "ratingCount": 1284,
      "stock": 37,
      "badges": ["BEST_SELLER"],         // BEST_SELLER | NEW | DEAL | LIMITED
      "shortDescription": "One sentence, <= 160 chars.",
      "description": "2–4 paragraphs separated by \n\n.",
      "features": ["5–7 bullet strings"],
      "specs": { "Display": "14\" 2.8K OLED" },   // 5–10 pairs, insertion-ordered
      "tags": ["laptop", "ultrabook"],
      "images": ["https://cdn.stocksnap.io/..."], // 3–5, all HTTP 200 verified
      "freeShipping": true,
      "createdAt": "2026-03-11T00:00:00.000Z"
    }
  ]
}
```

Hard requirements: **≥ 24 categories**, **exactly 500 products**, every product has
≥ 3 image URLs, and **every URL returned HTTP 200 during generation**. Products are
distributed across categories so no category has fewer than 12 products.

## 4. Database schema (database `shop`)

Tables, all `id uuid primary key default gen_random_uuid()` unless noted:

| Table | Notable columns |
| --- | --- |
| `categories` | `slug` unique, `name`, `tagline`, `icon`, `accent`, `hero_image`, `sort_order` |
| `subcategories` | `category_id` fk, `slug`, `name`, unique `(category_id, slug)` |
| `products` | `slug` unique, `name`, `brand`, `category_id`, `subcategory_id`, `price_cents`, `list_price_cents`, `rating`, `rating_count`, `stock`, `badges text[]`, `short_description`, `description`, `features text[]`, `specs jsonb`, `tags text[]`, `images text[]`, `free_shipping`, `created_at`, `search tsvector` generated |
| `users` | `email` citext unique, `name`, `password_hash`, `created_at` |
| `addresses` | `user_id`, `label`, `full_name`, `phone`, `line1`, `line2`, `city`, `governorate`, `postal_code`, `is_default` |
| `carts` | `user_id` unique |
| `cart_items` | `cart_id`, `product_id`, `qty`, unique `(cart_id, product_id)` |
| `wishlist_items` | `user_id`, `product_id`, unique pair |
| `reviews` | `product_id`, `user_id`, `rating`, `title`, `body`, `created_at`, unique `(product_id, user_id)` |
| `orders` | `user_id`, `order_number` unique, `status`, `payment_status`, `payment_method`, `subtotal_cents`, `shipping_cents`, `tax_cents`, `discount_cents`, `total_cents`, `shipping_*` address snapshot, `placed_at`, `paid_at` |
| `order_items` | `order_id`, `product_id`, `name`, `slug`, `image`, `unit_price_cents`, `qty`, `line_total_cents` — a **snapshot**, never joined for display |
| `payments` | `order_id`, `method`, `status`, `amount_cents`, `card_last4`, `card_brand`, `auth_code`, `orbit_transaction_id`, `orbit_reference`, `failure_code`, `failure_message`, `created_at` |
| `orbit_sessions` | `order_id`, `user_id`, `orbit_username`, `token` (server-only), `expires_at`, `state`, `attempted_at`, `created_at` |

`orders.order_number` is `JS-<year>-<6-digit sequence>`, e.g. `JS-2026-000123`. It is a
plain unique `text` column with **no** CHECK constraint and no shape-dependent index, on
purpose: orders placed before the Jerry's Shop rename still carry the old `OB-` prefix and
are never rewritten. Treat the prefix as opaque when parsing.

`orders.status`: `PENDING` `PAID` `PROCESSING` `SHIPPED` `DELIVERED` `CANCELLED` `NEEDS_REVIEW`
`orders.payment_status`: `UNPAID` `PAID` `FAILED` `UNCERTAIN`
`payments.status`: `APPROVED` `DECLINED` `ERROR`
`orbit_sessions.state`: `ACTIVE` `CONSUMED` `FAILED` `EXPIRED`

The Orbit verification token is stored **only** in `orbit_sessions.token` and is never
serialised into any API response.

## 5. Error envelope

Every non-2xx response from the shop API:

```json
{
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Your Orbit wallet doesn't have enough balance for this order.",
    "details": { "requiredCents": 459900, "fieldErrors": { "cardNumber": "Card number is invalid" } }
  }
}
```

`message` is safe to render directly to the user. `details` is optional.

## 6. Endpoints

Auth uses `Authorization: Bearer <jwt>`. Guest-allowed endpoints are marked ○,
auth-required ●.

### Catalog ○

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/shop/api/categories` | All categories + subcategories + `productCount` |
| GET | `/shop/api/products` | Query: `q`, `category`, `subcategory`, `brand` (repeatable), `minPrice`, `maxPrice` (cents), `minRating`, `badge`, `inStock`, `sort`, `page` (1-based), `pageSize` (max 60). `sort` ∈ `relevance` `newest` `price_asc` `price_desc` `rating` `popular`. Returns `{ items, page, pageSize, total, totalPages, facets: { brands: [{value,count}], priceRange: {minCents,maxCents}, ratings: [{value,count}] } }` |
| GET | `/shop/api/products/:slug` | Product + `related` (up to 8 from same subcategory) |
| GET | `/shop/api/products/:slug/reviews` | `{ items, total, summary: { average, counts: {5:n,...} } }` |
| GET | `/shop/api/home` | Curated homepage payload: `heroSlides`, `dealsOfTheDay`, `newArrivals`, `bestSellers`, `categoryRails: [{category, products}]` |

### Auth

| Method | Path | | Body / notes |
| --- | --- | --- | --- |
| POST | `/shop/api/auth/register` | ○ | `{name, email, password}` → `{token, user}`; password ≥ 8 chars |
| POST | `/shop/api/auth/login` | ○ | `{email, password}` → `{token, user}` |
| GET | `/shop/api/auth/me` | ● | `{user}` |

### Cart ●

`GET /cart`, `POST /cart/items {productId, qty}`, `PATCH /cart/items/:productId {qty}`
(qty 0 removes), `DELETE /cart/items/:productId`, `DELETE /cart`,
`POST /cart/merge {items:[{productId,qty}]}` for adopting a guest cart at login.

Cart response:
```json
{ "items": [{ "product": {...}, "qty": 2, "lineTotalCents": 9199800 }],
  "subtotalCents": 9199800, "shippingCents": 5000, "taxCents": 1287972,
  "totalCents": 10492772, "itemCount": 2 }
```

Shipping: free when subtotal ≥ 100000 cents (1000 EGP) or all items are
`freeShipping`, otherwise 5000 cents standard / 15000 cents express.
Tax: 14% VAT on subtotal, rounded half-up.

### Wishlist / addresses / reviews ●

`GET|POST|DELETE /wishlist[/:productId]`,
`GET|POST /addresses`, `PATCH|DELETE /addresses/:id`,
`POST /products/:slug/reviews {rating, title, body}` (one per user per product).

### Orders ●

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/shop/api/orders` | `{addressId, shippingMethod}` → snapshots the cart into a `PENDING` order. **Does not** clear the cart or take payment. 409 `CART_EMPTY`, 409 `OUT_OF_STOCK`. |
| GET | `/shop/api/orders` | Newest first |
| GET | `/shop/api/orders/:id` | Includes `items` and `payment` |
| POST | `/shop/api/orders/:id/pay/card` | See §7 |
| POST | `/shop/api/orders/:id/pay/orbit/verify` | See §8 |
| POST | `/shop/api/orders/:id/pay/orbit/confirm` | See §8 |

On successful payment the server, in one transaction: sets `payment_status=PAID`,
`status=PAID`, `paid_at=now()`, decrements `products.stock`, and clears the cart.

## 7. Card payment (dummy)

`POST /orders/:id/pay/card` with `{cardNumber, holderName, expMonth, expYear, cvv}`.

Validation before any "processing": strip spaces, **Luhn check**, expiry must be in the
future, CVV 3–4 digits, holder name non-empty. Failures → 400 `CARD_INVALID` with
`details.fieldErrors`.

Brand from IIN: `4`→Visa, `51–55`/`2221–2720`→Mastercard, `34`/`37`→Amex, `62`→UnionPay,
else Unknown. The processor sleeps 800–1500 ms to feel real, then decides:

| Card number | Outcome |
| --- | --- |
| `4242424242424242` | Approved |
| `4000000000000002` | 402 `CARD_DECLINED` — "Your card was declined by the issuer." |
| `4000000000009995` | 402 `CARD_INSUFFICIENT_FUNDS` |
| `4000000000000069` | 402 `CARD_EXPIRED` |
| `4000000000000127` | 402 `CARD_INCORRECT_CVC` |
| `4000000000000119` | 502 `CARD_PROCESSING_ERROR` |
| any other Luhn-valid | Approved |

Approved → `payments` row with `auth_code` (8 hex chars), `card_last4`, `card_brand`.
The full PAN is never stored or logged.

## 8. Orbit wallet payment

Two steps so the wallet password is posted exactly once and the resulting token stays
server-side.

### Step 1 — `POST /orders/:id/pay/orbit/verify` `{username, password}`

Server calls `POST {ORBIT_API_BASE}/external/verify`. On success it stores the token in
`orbit_sessions` and responds:

```json
{ "sessionId": "…", "maskedUsername": "om••••23", "expiresAt": "…", "amountCents": 10492772 }
```

Any pre-existing `ACTIVE` session for the order is marked `EXPIRED` first, so a user who
retries never has two live tokens.

### Step 2 — `POST /orders/:id/pay/orbit/confirm` `{sessionId}`

Server calls `POST {ORBIT_API_BASE}/external/pay`:

```json
{ "verificationToken": "<from orbit_sessions>",
  "merchantName": "Jerry's Shop",
  "productName": "Order JS-2026-000123 (3 items)",
  "cashAmount": 104927.72 }
```

`cashAmount` = `totalCents / 100` serialised with exactly 2 decimals — send it as a JSON
number produced from a string to avoid float drift. `productName` is truncated to 255.

Before issuing the call the server sets `orbit_sessions.attempted_at`. This matters: if
the HTTP call times out we cannot know whether the wallet was debited.

### Orbit error mapping

The Spring backend returns RFC-7807 with a `code` field. Map it:

| Orbit `code` | HTTP out | Shop `code` | Message shown to the user |
| --- | --- | --- | --- |
| `INVALID_CREDENTIALS` | 401 | `ORBIT_INVALID_CREDENTIALS` | Wrong Orbit username or password. |
| `ACCOUNT_NOT_VERIFIED` | 403 | `ORBIT_ACCOUNT_NOT_VERIFIED` | Your Orbit account isn't verified yet. Activate it from the Orbit app, then try again. |
| `ACCOUNT_SUSPENDED` | 403 | `ORBIT_ACCOUNT_SUSPENDED` | Your Orbit account is suspended. Contact Orbit support. |
| `TOKEN_INVALID` | 400 | `ORBIT_SESSION_INVALID` | That payment session is no longer valid. Please sign in to your wallet again. |
| `TOKEN_EXPIRED` | 410 | `ORBIT_SESSION_EXPIRED` | Your payment session expired. Wallet sign-in is valid for one hour — please sign in again. |
| `TOKEN_ALREADY_USED` | 409 | `ORBIT_SESSION_USED` | This payment session was already used. |
| `INSUFFICIENT_BALANCE` | 402 | `ORBIT_INSUFFICIENT_BALANCE` | Your Orbit wallet doesn't have enough balance for this order. |
| `DAILY_LIMIT_EXCEEDED` | 422 | `ORBIT_DAILY_LIMIT` | This purchase would go over the daily spending limit on your Orbit account. |
| `MONTHLY_LIMIT_EXCEEDED` | 422 | `ORBIT_MONTHLY_LIMIT` | This purchase would go over the monthly spending limit on your Orbit account. |
| `MAX_PER_TRANSACTION_EXCEEDED` | 422 | `ORBIT_PER_TXN_LIMIT` | This order is larger than the per-transaction limit on your Orbit account. |
| `AMOUNT_INVALID` | 400 | `ORBIT_AMOUNT_INVALID` | We couldn't charge this amount. Please refresh your cart. |
| `FIELD_REQUIRED` | 400 | `ORBIT_BAD_REQUEST` | Something was missing from the payment request. Please try again. |
| timeout / connection refused / 5xx | 502 | `ORBIT_UNAVAILABLE` | We couldn't reach Orbit right now. Your order is saved — try paying again in a moment. |

Sessions are marked `CONSUMED` on success and on `TOKEN_ALREADY_USED`; `EXPIRED` on the
two token-expiry codes; `FAILED` otherwise. Balance and limit failures leave the session
`ACTIVE` **only if** the token was not consumed — Orbit consumes the token after the
debit succeeds, so a rejected payment leaves it reusable; the API re-checks `expiresAt`
before offering a retry.

### The uncertain case

If `/external/pay` times out or the connection drops **after** `attempted_at` was set,
the debit may or may not have happened. Do not retry automatically and do not report
success. Set `orders.status=NEEDS_REVIEW`, `payment_status=UNCERTAIN`, record a
`payments` row with `status=ERROR`, and return 502 `ORBIT_UNCERTAIN` with:

> We lost contact with Orbit while your payment was going through. Check your Orbit
> transactions before paying again — this order is on hold so you aren't charged twice.

The UI must render this as a warning, never as a failure, and must not offer a one-click
retry for that order.

## 9. Frontend routes (baseHref `/shop/`)

`/` home · `/c/:categorySlug[/:subSlug]` browse · `/search` · `/p/:slug` product ·
`/cart` · `/checkout` · `/orders` · `/orders/:id` · `/account` · `/wishlist` ·
`/login` · `/register` · `**` not-found.

Guest carts live in `localStorage` under `ob.cart` and are POSTed to `/cart/merge` right
after login or registration.

## 10. Non-negotiables

1. No wallet credential or Orbit token is ever stored in `localStorage`, put in a URL, or
   returned to the browser.
2. Card PANs are never persisted or logged — last 4 only.
3. The uncertain-payment path in §8 must exist. Reporting a timeout as a failure would
   invite a double charge.
4. Every product image URL in the committed catalog was verified to return 200.
