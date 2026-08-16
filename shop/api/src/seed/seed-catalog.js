import fs from 'node:fs/promises';
import { config } from '../config.js';
import { withTransaction, query } from '../db/pool.js';
import { logger } from '../lib/logger.js';

/**
 * Load and sanity-check the generated catalog.
 * The file is produced at build time by a separate generator; if it is not
 * there we fail loudly rather than booting an empty shop.
 *
 * @param {string} [file]
 */
export async function loadCatalog(file = config.catalogPath) {
  let raw;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(
        `Catalog file not found at ${file}. ` +
          'It is generated at build time into shop/api/src/catalog/catalog.json and must be committed. ' +
          'Set CATALOG_PATH to point somewhere else, or run the catalog generator.',
      );
    }
    throw err;
  }

  let catalog;
  try {
    catalog = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Catalog at ${file} is not valid JSON: ${err.message}`);
  }

  if (!Array.isArray(catalog?.categories) || catalog.categories.length === 0) {
    throw new Error(`Catalog at ${file} has no categories.`);
  }
  if (!Array.isArray(catalog?.products) || catalog.products.length === 0) {
    throw new Error(`Catalog at ${file} has no products.`);
  }
  return catalog;
}

/** Reshape a catalog category into the flat row the SQL expects. */
function categoryRows(categories) {
  return categories.map((c, i) => ({
    slug: c.slug,
    name: c.name,
    tagline: c.tagline ?? null,
    icon: c.icon ?? null,
    accent: c.accent ?? null,
    hero_image: c.heroImage ?? null,
    sort_order: Number.isInteger(c.sortOrder) ? c.sortOrder : i,
  }));
}

function subcategoryRows(categories) {
  const out = [];
  for (const c of categories) {
    (c.subcategories ?? []).forEach((s, i) => {
      out.push({
        category_slug: c.slug,
        slug: s.slug,
        name: s.name,
        sort_order: Number.isInteger(s.sortOrder) ? s.sortOrder : i,
      });
    });
  }
  return out;
}

function productRows(products) {
  return products.map((p) => ({
    external_id: p.id ?? null,
    slug: p.slug,
    name: p.name,
    brand: p.brand ?? 'Unbranded',
    category_slug: p.categorySlug,
    subcategory_slug: p.subcategorySlug ?? null,
    price_cents: p.priceCents,
    list_price_cents: p.listPriceCents ?? null,
    rating: p.rating ?? 0,
    rating_count: p.ratingCount ?? 0,
    stock: p.stock ?? 0,
    badges: p.badges ?? [],
    short_description: p.shortDescription ?? '',
    description: p.description ?? '',
    features: p.features ?? [],
    specs: p.specs ?? {},
    tags: p.tags ?? [],
    images: p.images ?? [],
    free_shipping: Boolean(p.freeShipping),
    created_at: p.createdAt ?? new Date().toISOString(),
  }));
}

/**
 * Idempotent catalog seed.
 *
 * Everything goes in through three set-based statements — the whole payload is
 * handed to Postgres as a single jsonb parameter and expanded with
 * `jsonb_to_recordset`, so 500 products is three round trips, not 500.
 *
 * @param {{ force?: boolean, catalog?: any }} [opts]
 * @returns {Promise<{ seeded: boolean, reason: string, counts?: object }>}
 */
export async function seedCatalog(opts = {}) {
  const { rows: metaRows } = await query('SELECT version, product_count FROM catalog_meta WHERE id = 1');
  const { rows: countRows } = await query('SELECT count(*)::bigint AS n FROM products');
  const existingProducts = Number(countRows[0].n);
  const recordedVersion = metaRows[0]?.version ?? null;

  const catalog = opts.catalog ?? (await loadCatalog());
  const version = String(catalog.version ?? '1');

  if (!opts.force && existingProducts > 0 && recordedVersion === version) {
    logger.info('catalog already seeded', { version, products: existingProducts });
    return { seeded: false, reason: 'up-to-date', counts: { products: existingProducts } };
  }

  const cats = categoryRows(catalog.categories);
  const subs = subcategoryRows(catalog.categories);
  const prods = productRows(catalog.products);
  const startedAt = Date.now();

  const counts = await withTransaction(async (client) => {
    const c = await client.query(
      `INSERT INTO categories (slug, name, tagline, icon, accent, hero_image, sort_order)
       SELECT slug, name, tagline, icon, accent, hero_image, sort_order
       FROM jsonb_to_recordset($1::jsonb) AS x(
         slug text, name text, tagline text, icon text, accent text,
         hero_image text, sort_order integer)
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name, tagline = EXCLUDED.tagline, icon = EXCLUDED.icon,
         accent = EXCLUDED.accent, hero_image = EXCLUDED.hero_image,
         sort_order = EXCLUDED.sort_order`,
      [JSON.stringify(cats)],
    );

    const s = await client.query(
      `INSERT INTO subcategories (category_id, slug, name, sort_order)
       SELECT cat.id, x.slug, x.name, x.sort_order
       FROM jsonb_to_recordset($1::jsonb) AS x(
         category_slug text, slug text, name text, sort_order integer)
       JOIN categories cat ON cat.slug = x.category_slug
       ON CONFLICT (category_id, slug) DO UPDATE SET
         name = EXCLUDED.name, sort_order = EXCLUDED.sort_order`,
      [JSON.stringify(subs)],
    );

    const p = await client.query(
      `INSERT INTO products (
         external_id, slug, name, brand, category_id, subcategory_id,
         price_cents, list_price_cents, rating, rating_count, stock, badges,
         short_description, description, features, specs, tags, images,
         free_shipping, created_at)
       SELECT
         x.external_id, x.slug, x.name, x.brand, cat.id, sub.id,
         x.price_cents, x.list_price_cents, x.rating, x.rating_count, x.stock, x.badges,
         x.short_description, x.description, x.features, x.specs, x.tags, x.images,
         x.free_shipping, x.created_at
       FROM jsonb_to_recordset($1::jsonb) AS x(
         external_id text, slug text, name text, brand text,
         category_slug text, subcategory_slug text,
         price_cents bigint, list_price_cents bigint, rating numeric,
         rating_count integer, stock integer, badges text[],
         short_description text, description text, features text[], specs jsonb,
         tags text[], images text[], free_shipping boolean, created_at timestamptz)
       JOIN categories cat ON cat.slug = x.category_slug
       LEFT JOIN subcategories sub
              ON sub.category_id = cat.id AND sub.slug = x.subcategory_slug
       ON CONFLICT (slug) DO UPDATE SET
         external_id = EXCLUDED.external_id, name = EXCLUDED.name, brand = EXCLUDED.brand,
         category_id = EXCLUDED.category_id, subcategory_id = EXCLUDED.subcategory_id,
         price_cents = EXCLUDED.price_cents, list_price_cents = EXCLUDED.list_price_cents,
         rating = EXCLUDED.rating, rating_count = EXCLUDED.rating_count,
         stock = EXCLUDED.stock, badges = EXCLUDED.badges,
         short_description = EXCLUDED.short_description, description = EXCLUDED.description,
         features = EXCLUDED.features, specs = EXCLUDED.specs, tags = EXCLUDED.tags,
         images = EXCLUDED.images, free_shipping = EXCLUDED.free_shipping,
         created_at = EXCLUDED.created_at`,
      [JSON.stringify(prods)],
    );

    await client.query(
      `INSERT INTO catalog_meta (id, version, currency, seeded_at, product_count)
       VALUES (1, $1, $2, now(), $3)
       ON CONFLICT (id) DO UPDATE SET
         version = EXCLUDED.version, currency = EXCLUDED.currency,
         seeded_at = EXCLUDED.seeded_at, product_count = EXCLUDED.product_count`,
      [version, catalog.currency ?? 'EGP', prods.length],
    );

    return { categories: c.rowCount, subcategories: s.rowCount, products: p.rowCount };
  });

  logger.info('catalog seeded', { version, ...counts, ms: Date.now() - startedAt });
  return { seeded: true, reason: existingProducts === 0 ? 'empty' : 'version-changed', counts };
}
