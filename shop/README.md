# Jerry's Shop

A storefront that pays with the Orbit wallet. One Node process serves both the
Angular bundle at `/shop/` and the Express API at `/shop/api` — same origin, so
there is no CORS anywhere in the shop.

- [`CONTRACT.md`](CONTRACT.md) — the binding spec shared by the API and the web app.
- [`api/`](api/) — Express 5 + Postgres.
- [`web/`](web/) — Angular storefront, `baseHref: /shop/`.
- [`tools/`](tools/) — catalog generator.

Production: **http://46.224.100.97/shop/**

```
Browser → nginx (orbit-web :80)
            ├─ /orbit/  → Angular admin/banking SPA (static)
            ├─ /api/    → orbit-app:8080  (Spring Boot)
            └─ /shop/   → orbit-shop:4000 (this app — reverse proxy only)
                            ├─ Angular bundle (express.static)
                            └─ /shop/api/*
                                 ├─ orbit-db:5432, database "shop"
                                 └─ orbit-app:8080/api/v1/external/*
```

The shop container publishes no host port in production; nginx reaches it over
the compose network.

---

## Run it locally

### Docker Compose (closest to production)

```bash
docker compose -f shop/docker-compose.dev.yml up --build
# → http://localhost:4000/shop/
```

Brings up Postgres + the shop. The Java backend is **not** needed: every Orbit
call is server-to-server, so `ORBIT_API_BASE` defaults to the deployed backend
and wallet checkout works against real Orbit accounts.

```bash
# Point at a locally running Spring Boot instead
ORBIT_API_BASE=http://host.docker.internal:8080/api/v1 \
  docker compose -f shop/docker-compose.dev.yml up --build

docker compose -f shop/docker-compose.dev.yml down     # keep the database
docker compose -f shop/docker-compose.dev.yml down -v  # wipe it
```

Postgres is published on `localhost:5433` (`orbit`/`orbit`), so it never
collides with an existing local Postgres.

This builds the Angular app, so `shop/web/` must be present and buildable.

### Bare node (fastest for API work)

Needs Node 22+ and any reachable Postgres.

```bash
cd shop/api
npm install
cp .env.example .env      # then edit DATABASE_URL / BOOTSTRAP_DATABASE_URL

npm run dev               # node --watch
npm start                 # plain
npm test                  # node --test, no database required
```

The API creates the `shop` database, migrates, and seeds the catalog on first
boot. Without a built Angular bundle it still serves `/shop/api/*` and answers
`/shop/` with `503 WEB_BUNDLE_MISSING` — expected, not a bug.

To serve a locally built bundle:

```bash
cd shop/web && npm run build          # → dist/web/browser
cd ../api && npm start                # SHOP_WEB_DIST defaults to ../web/dist/web/browser
```

Useful one-offs:

```bash
npm run migrate   # schema only
npm run seed      # re-seed the catalog (force)
```

---

## Environment variables

`shop/api/.env.example` is the template. Full table in [CONTRACT §2](CONTRACT.md).

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `4000` | HTTP port |
| `DATABASE_URL` | — | Postgres URL for the **`shop`** database |
| `BOOTSTRAP_DATABASE_URL` | — | URL to the `postgres` maintenance DB. Used once at boot to `CREATE DATABASE shop`. Required on the server (see below) |
| `ORBIT_API_BASE` | `http://app:8080/api/v1` | Base URL of the Spring backend |
| `ORBIT_MERCHANT_NAME` | `Jerry's Shop` | Sent as `merchantName`, truncated to 255 |
| `ORBIT_TIMEOUT_MS` | `15000` | Per-request timeout for Orbit calls |
| `JWT_SECRET` | insecure dev fallback | Signs **shop** session tokens |
| `SEED_ON_BOOT` | `true` | Seed the catalog when `products` is empty |
| `LOG_LEVEL` | `info` | |
| `SHOP_WEB_DIST` | `../web/dist/web/browser` | Angular bundle directory. The image sets `/app/web` |
| `CATALOG_PATH` | `src/catalog/catalog.json` | |
| `BCRYPT_ROUNDS` | `10` | |
| `CARD_LATENCY_MIN_MS` / `CARD_LATENCY_MAX_MS` | `800` / `1500` | Dummy processor latency; set both to `0` in tests |

**`BOOTSTRAP_DATABASE_URL` is not optional in production.** The shop reuses the
existing `orbit-db` container, whose volume predates this app, so
`docker-entrypoint-initdb.d` never runs and the `shop` database simply is not
there. `src/db/bootstrap.js` creates it at boot; the operation is idempotent and
safe if two instances race.

On the server, `JWT_SECRET` for the shop comes from **`SHOP_JWT_SECRET`** in
`/root/orbit/.env`, mapped in `backend/deploy/docker-compose.yml`. It is
deliberately *not* the backend's `JWT_SECRET`: the two sign different things
(storefront logins vs. Orbit banking sessions) and a token minted by one must
never be presentable to the other. If `SHOP_JWT_SECRET` is missing, compose
falls back to a value derived from `POSTGRES_PASSWORD` so a deploy cannot break
on it — but set it explicitly.

---

## Regenerating the catalog

`shop/api/src/catalog/catalog.json` is generated at build time and **committed**:
24+ categories, exactly 500 products, every image URL verified `200` during
generation ([CONTRACT §3](CONTRACT.md)).

```bash
node shop/tools/build-catalog.mjs             # rebuild (seconds when the cache is warm)
node shop/tools/build-catalog.mjs --validate  # validate the committed file
node shop/tools/build-catalog.mjs --refresh   # ignore cached Openverse responses
node shop/tools/build-catalog.mjs --recheck   # re-verify every image URL
```

Output is byte-for-byte reproducible (seeded PRNG, pinned clock). A cold build
makes ~250 Openverse calls and takes ~15 minutes — the Openverse anonymous quota
is 20 req/min, 200/day, so use `--refresh` sparingly. `shop/tools/.cache/` is
gitignored. Details in [`tools/README.md`](tools/README.md).

After regenerating, restart the API with `SEED_ON_BOOT=true` against an empty
`products` table, or run `npm run seed` in `shop/api` to force a re-seed.

---

## Test cards

`POST /shop/api/orders/:id/pay/card` with `{cardNumber, holderName, expMonth, expYear, cvv}`.
Validation happens before any "processing": Luhn, future expiry, 3–4 digit CVV,
non-empty holder name → otherwise `400 CARD_INVALID` with `details.fieldErrors`.
Then the processor sleeps 800–1500 ms and decides:

| Card number | Outcome |
| --- | --- |
| `4242 4242 4242 4242` | Approved |
| `4000 0000 0000 0002` | 402 `CARD_DECLINED` |
| `4000 0000 0000 9995` | 402 `CARD_INSUFFICIENT_FUNDS` |
| `4000 0000 0000 0069` | 402 `CARD_EXPIRED` |
| `4000 0000 0000 0127` | 402 `CARD_INCORRECT_CVC` |
| `4000 0000 0000 0119` | 502 `CARD_PROCESSING_ERROR` |
| any other Luhn-valid number | Approved |

Use any future expiry and any 3-digit CVV. The full PAN is never stored or
logged — only `card_last4` and `card_brand`.

---

## How the Orbit wallet payment works

The browser never talks to the Orbit banking API. Both calls are
server-to-server from the shop, which is what keeps wallet credentials off the
client and makes the backend's missing CORS config irrelevant.

```
1. POST /shop/api/orders                      → order snapshot, status PENDING
                                                 (cart is NOT cleared, nothing charged)

2. POST /shop/api/orders/:id/pay/orbit/verify  {username, password}
      shop ──▶ POST {ORBIT_API_BASE}/external/verify
      ◀── verificationToken
      stored in orbit_sessions.token, server-side only
      ──▶ {sessionId, maskedUsername, expiresAt, amountCents}
           (any pre-existing ACTIVE session for the order is EXPIRED first,
            so a retry never leaves two live tokens)

3. POST /shop/api/orders/:id/pay/orbit/confirm {sessionId}
      orbit_sessions.attempted_at = now()      ← set *before* the call
      shop ──▶ POST {ORBIT_API_BASE}/external/pay
                 {verificationToken, merchantName, productName, cashAmount}
      ◀── success
      one transaction: payment_status=PAID, status=PAID, paid_at=now(),
      products.stock decremented, cart cleared, payments row written
```

The wallet password is posted exactly once, in step 2. The verification token
lives only in `orbit_sessions.token` and is never serialised into any API
response — same for `localStorage` and URLs.

Money is integer minor units (piastres, EGP) everywhere except this one call:
`cashAmount` is `totalCents / 100` serialised from a string with exactly two
decimals, because the Orbit endpoint takes a `BigDecimal`.

Orbit's RFC-7807 `code` is mapped to a shop error code and a user-facing message
— the full table is [CONTRACT §8](CONTRACT.md). Sessions become `CONSUMED` on
success and on `TOKEN_ALREADY_USED`, `EXPIRED` on token-expiry codes, `FAILED`
otherwise. Balance and limit rejections leave the session `ACTIVE` and reusable,
because Orbit only consumes the token once the debit succeeds.

### The uncertain case

If `/external/pay` times out or the connection drops after `attempted_at` was
set, the wallet may or may not have been debited. The shop does **not** retry
and does **not** report success. It sets `orders.status = NEEDS_REVIEW`,
`payment_status = UNCERTAIN`, writes a `payments` row with `status = ERROR`, and
returns `502 ORBIT_UNCERTAIN`:

> We lost contact with Orbit while your payment was going through. Check your
> Orbit transactions before paying again — this order is on hold so you aren't
> charged twice.

The UI renders this as a warning, never a failure, and offers no one-click
retry. Reporting a timeout as a plain failure is how you get a double charge.

---

## Deployment

`shop/Dockerfile` (context `shop/`) builds Angular, installs API production
deps, and ships both on `node:22-alpine` as the non-root `node` user with a
`HEALTHCHECK` on `/shop/api/health`.

Pushes to `main` run `.github/workflows/deploy.yml`, which builds
`ghcr.io/mohamed-mahmoud377/orbit-gard-project:shop-<sha>` and `:shop-latest`,
then restarts the stack and smoke-checks `/shop/` → 200 and `/shop/api/health` →
`{"status":"ok"}`. See [`backend/deploy/README.md`](../backend/deploy/README.md).
