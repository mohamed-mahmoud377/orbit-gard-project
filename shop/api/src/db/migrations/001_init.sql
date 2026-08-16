-- Jerry's Shop — initial schema (CONTRACT §4).
-- Money is always integer minor units (piastres). Currency is EGP everywhere.

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;     -- case-insensitive email
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- substring/typo-tolerant product search

-- ---------------------------------------------------------------- catalog ---

CREATE TABLE categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  tagline     text,
  icon        text,
  accent      text,
  hero_image  text,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX categories_sort_idx ON categories (sort_order, name);

CREATE TABLE subcategories (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id  uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  slug         text NOT NULL,
  name         text NOT NULL,
  sort_order   integer NOT NULL DEFAULT 0,
  UNIQUE (category_id, slug)
);
CREATE INDEX subcategories_category_idx ON subcategories (category_id);

-- `array_to_string` is only STABLE (its volatility allows for type output
-- functions in general), so it cannot appear in a generated column. For text[]
-- it is genuinely immutable, and this wrapper is what lets the search vector be
-- STORED rather than recomputed per query.
CREATE OR REPLACE FUNCTION shop_array_to_text(arr text[])
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
RETURNS NULL ON NULL INPUT
AS $$ SELECT coalesce(array_to_string(arr, ' '), '') $$;

CREATE TABLE products (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id        text UNIQUE,
  slug               text NOT NULL UNIQUE,
  name               text NOT NULL,
  brand              text NOT NULL,
  category_id        uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  subcategory_id     uuid REFERENCES subcategories(id) ON DELETE SET NULL,
  price_cents        bigint NOT NULL CHECK (price_cents >= 0),
  list_price_cents   bigint CHECK (list_price_cents IS NULL OR list_price_cents >= 0),
  rating             numeric(2,1) NOT NULL DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
  rating_count       integer NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
  stock              integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  badges             text[] NOT NULL DEFAULT '{}',
  short_description  text NOT NULL DEFAULT '',
  description        text NOT NULL DEFAULT '',
  features           text[] NOT NULL DEFAULT '{}',
  specs              jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags               text[] NOT NULL DEFAULT '{}',
  images             text[] NOT NULL DEFAULT '{}',
  free_shipping      boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  -- Weighted full-text vector. `english` is passed explicitly so the expression
  -- is IMMUTABLE and can back a STORED generated column.
  search tsvector GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(name, '')), 'A')
   || setweight(to_tsvector('english', coalesce(brand, '')), 'A')
   || setweight(to_tsvector('english', coalesce(shop_array_to_text(tags), '')), 'B')
   || setweight(to_tsvector('english', coalesce(short_description, '')), 'C')
   || setweight(to_tsvector('english', coalesce(description, '')), 'D')
  ) STORED
);

CREATE INDEX products_search_idx        ON products USING GIN (search);
CREATE INDEX products_name_trgm_idx     ON products USING GIN (name gin_trgm_ops);
CREATE INDEX products_category_idx      ON products (category_id);
CREATE INDEX products_subcategory_idx   ON products (subcategory_id);
CREATE INDEX products_price_idx         ON products (price_cents);
CREATE INDEX products_rating_idx        ON products (rating DESC);
CREATE INDEX products_created_idx       ON products (created_at DESC);
CREATE INDEX products_popular_idx       ON products (rating_count DESC);
CREATE INDEX products_brand_idx         ON products (brand);
CREATE INDEX products_badges_idx        ON products USING GIN (badges);

-- Records which catalog.json version is currently loaded, so reseeding is a
-- version comparison rather than a guess.
CREATE TABLE catalog_meta (
  id          integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  version     text NOT NULL,
  currency    text NOT NULL DEFAULT 'EGP',
  seeded_at   timestamptz NOT NULL DEFAULT now(),
  product_count integer NOT NULL DEFAULT 0
);

-- ------------------------------------------------------------------ users ---

CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          citext NOT NULL UNIQUE,
  name           text NOT NULL,
  password_hash  text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE addresses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label         text,
  full_name     text NOT NULL,
  phone         text NOT NULL,
  line1         text NOT NULL,
  line2         text,
  city          text NOT NULL,
  governorate   text NOT NULL,
  postal_code   text,
  is_default    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX addresses_user_idx ON addresses (user_id, created_at DESC);
-- At most one default address per user.
CREATE UNIQUE INDEX addresses_one_default_idx ON addresses (user_id) WHERE is_default;

-- ------------------------------------------------------------------- cart ---

CREATE TABLE carts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cart_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id     uuid NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  qty         integer NOT NULL CHECK (qty > 0),
  added_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cart_id, product_id)
);
CREATE INDEX cart_items_cart_idx ON cart_items (cart_id);

CREATE TABLE wishlist_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);
CREATE INDEX wishlist_user_idx ON wishlist_items (user_id, created_at DESC);

CREATE TABLE reviews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating      integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title       text,
  body        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, user_id)
);
CREATE INDEX reviews_product_idx ON reviews (product_id, created_at DESC);

-- ----------------------------------------------------------------- orders ---

CREATE SEQUENCE order_number_seq START 1;

CREATE TABLE orders (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_number          text NOT NULL UNIQUE,
  status                text NOT NULL DEFAULT 'PENDING'
                          CHECK (status IN ('PENDING','PAID','PROCESSING','SHIPPED','DELIVERED','CANCELLED','NEEDS_REVIEW')),
  payment_status        text NOT NULL DEFAULT 'UNPAID'
                          CHECK (payment_status IN ('UNPAID','PAID','FAILED','UNCERTAIN')),
  payment_method        text CHECK (payment_method IS NULL OR payment_method IN ('CARD','ORBIT_WALLET')),
  shipping_method       text NOT NULL DEFAULT 'standard' CHECK (shipping_method IN ('standard','express')),
  subtotal_cents        bigint NOT NULL,
  shipping_cents        bigint NOT NULL DEFAULT 0,
  tax_cents             bigint NOT NULL DEFAULT 0,
  discount_cents        bigint NOT NULL DEFAULT 0,
  total_cents           bigint NOT NULL,
  shipping_full_name    text NOT NULL,
  shipping_phone        text NOT NULL,
  shipping_line1        text NOT NULL,
  shipping_line2        text,
  shipping_city         text NOT NULL,
  shipping_governorate  text NOT NULL,
  shipping_postal_code  text,
  placed_at             timestamptz NOT NULL DEFAULT now(),
  paid_at               timestamptz
);
CREATE INDEX orders_user_idx ON orders (user_id, placed_at DESC);

CREATE TABLE order_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id        uuid REFERENCES products(id) ON DELETE SET NULL,
  name              text NOT NULL,
  slug              text NOT NULL,
  image             text,
  unit_price_cents  bigint NOT NULL,
  qty               integer NOT NULL CHECK (qty > 0),
  line_total_cents  bigint NOT NULL
);
CREATE INDEX order_items_order_idx ON order_items (order_id);

CREATE TABLE payments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  method                text NOT NULL CHECK (method IN ('CARD','ORBIT_WALLET')),
  status                text NOT NULL CHECK (status IN ('APPROVED','DECLINED','ERROR')),
  amount_cents          bigint NOT NULL,
  card_last4            text,     -- last 4 only; the PAN is never persisted
  card_brand            text,
  auth_code             text,
  orbit_transaction_id  text,
  orbit_reference       text,
  failure_code          text,
  failure_message       text,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_order_idx ON payments (order_id, created_at DESC);
-- An order can only ever have one APPROVED payment.
CREATE UNIQUE INDEX payments_one_approved_idx ON payments (order_id) WHERE status = 'APPROVED';

CREATE TABLE orbit_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  orbit_username  text NOT NULL,
  token           text NOT NULL,   -- server-only, never serialised to a response
  expires_at      timestamptz NOT NULL,
  state           text NOT NULL DEFAULT 'ACTIVE'
                    CHECK (state IN ('ACTIVE','CONSUMED','FAILED','EXPIRED')),
  attempted_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orbit_sessions_order_idx ON orbit_sessions (order_id, created_at DESC);
CREATE INDEX orbit_sessions_active_idx ON orbit_sessions (order_id) WHERE state = 'ACTIVE';
