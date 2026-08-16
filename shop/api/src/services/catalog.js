import { query } from '../db/pool.js';

/** Columns every product-shaped response selects. */
export const PRODUCT_COLUMNS = `
  p.id, p.external_id, p.slug, p.name, p.brand,
  p.price_cents, p.list_price_cents, p.rating, p.rating_count, p.stock,
  p.badges, p.short_description, p.description, p.features, p.specs,
  p.tags, p.images, p.free_shipping, p.created_at,
  c.slug AS category_slug, c.name AS category_name,
  s.slug AS subcategory_slug, s.name AS subcategory_name`;

export const PRODUCT_FROM = `
  FROM products p
  JOIN categories c ON c.id = p.category_id
  LEFT JOIN subcategories s ON s.id = p.subcategory_id`;

const iso = (v) => (v instanceof Date ? v.toISOString() : v);

/** Full product DTO — used by /products/:slug. */
export function toProduct(row) {
  return {
    id: row.id,
    sku: row.external_id,
    slug: row.slug,
    name: row.name,
    brand: row.brand,
    category: { slug: row.category_slug, name: row.category_name },
    subcategory: row.subcategory_slug ? { slug: row.subcategory_slug, name: row.subcategory_name } : null,
    priceCents: Number(row.price_cents),
    listPriceCents: row.list_price_cents === null ? null : Number(row.list_price_cents),
    discountPercent:
      row.list_price_cents && Number(row.list_price_cents) > Number(row.price_cents)
        ? Math.round((1 - Number(row.price_cents) / Number(row.list_price_cents)) * 100)
        : 0,
    rating: Number(row.rating),
    ratingCount: row.rating_count,
    stock: row.stock,
    inStock: row.stock > 0,
    badges: row.badges ?? [],
    shortDescription: row.short_description,
    description: row.description,
    features: row.features ?? [],
    specs: row.specs ?? {},
    tags: row.tags ?? [],
    images: row.images ?? [],
    freeShipping: row.free_shipping,
    createdAt: iso(row.created_at),
  };
}

/** Trimmed DTO for grids, rails, cart lines and wishlists. */
export function toProductCard(row) {
  const full = toProduct(row);
  return {
    id: full.id,
    slug: full.slug,
    name: full.name,
    brand: full.brand,
    category: full.category,
    subcategory: full.subcategory,
    priceCents: full.priceCents,
    listPriceCents: full.listPriceCents,
    discountPercent: full.discountPercent,
    rating: full.rating,
    ratingCount: full.ratingCount,
    stock: full.stock,
    inStock: full.inStock,
    badges: full.badges,
    shortDescription: full.shortDescription,
    image: full.images[0] ?? null,
    images: full.images,
    freeShipping: full.freeShipping,
    createdAt: full.createdAt,
  };
}

/**
 * Build the WHERE fragment for a product search.
 *
 * `exclude` names a filter dimension to leave out, which is how the facet
 * counts are produced: the brand facet is counted with every filter applied
 * *except* brand, so ticking one brand doesn't collapse the brand list to that
 * single entry — the behaviour every real storefront has.
 *
 * @param {object} f parsed filters
 * @param {'brand'|'price'|'rating'|null} [exclude]
 * @returns {{ sql: string, params: unknown[], joinsTsQuery: boolean }}
 */
export function buildProductWhere(f, exclude = null) {
  const params = [];
  const clauses = [];
  const push = (value) => `$${params.push(value)}`;

  if (f.q) {
    // websearch_to_tsquery handles quotes/OR/- the way a shopper expects;
    // the trigram clause catches partial words the lexemes miss.
    clauses.push(`(p.search @@ websearch_to_tsquery('english', ${push(f.q)}) OR p.name ILIKE ${push(`%${f.q}%`)})`);
  }
  if (f.category) clauses.push(`c.slug = ${push(f.category)}`);
  if (f.subcategory) clauses.push(`s.slug = ${push(f.subcategory)}`);
  if (exclude !== 'brand' && f.brand?.length) clauses.push(`p.brand = ANY(${push(f.brand)}::text[])`);
  if (exclude !== 'price' && f.minPrice !== undefined) clauses.push(`p.price_cents >= ${push(f.minPrice)}`);
  if (exclude !== 'price' && f.maxPrice !== undefined) clauses.push(`p.price_cents <= ${push(f.maxPrice)}`);
  if (exclude !== 'rating' && f.minRating !== undefined) clauses.push(`p.rating >= ${push(f.minRating)}`);
  if (f.badge) clauses.push(`${push(f.badge)} = ANY(p.badges)`);
  if (f.inStock) clauses.push('p.stock > 0');

  return {
    sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
    joinsTsQuery: Boolean(f.q),
  };
}

/**
 * ORDER BY for a sort key. `relevance` only means anything when there is a
 * query; without one it degrades to "good and popular first".
 * @param {string} sort
 * @param {boolean} hasQuery
 * @param {string} [rankExpr]
 */
export function orderByFor(sort, hasQuery, rankExpr = 'rank') {
  switch (sort) {
    case 'newest':
      return 'p.created_at DESC, p.id';
    case 'price_asc':
      return 'p.price_cents ASC, p.id';
    case 'price_desc':
      return 'p.price_cents DESC, p.id';
    case 'rating':
      return 'p.rating DESC, p.rating_count DESC, p.id';
    case 'popular':
      return 'p.rating_count DESC, p.rating DESC, p.id';
    case 'relevance':
    default:
      return hasQuery
        ? `${rankExpr} DESC, p.rating DESC, p.id`
        : 'p.rating DESC, p.rating_count DESC, p.id';
  }
}

/**
 * Run the search: one page query, one count, three facet queries.
 * @param {object} f
 */
export async function searchProducts(f) {
  const base = buildProductWhere(f);
  const rankSelect = f.q
    ? `, ts_rank(p.search, websearch_to_tsquery('english', $${base.params.length + 1})) AS rank`
    : '';
  const pageParams = [...base.params];
  if (f.q) pageParams.push(f.q);

  const limitParam = `$${pageParams.push(f.pageSize)}`;
  const offsetParam = `$${pageParams.push((f.page - 1) * f.pageSize)}`;

  const itemsSql = `
    SELECT ${PRODUCT_COLUMNS}${rankSelect}
    ${PRODUCT_FROM}
    ${base.sql}
    ORDER BY ${orderByFor(f.sort, Boolean(f.q))}
    LIMIT ${limitParam} OFFSET ${offsetParam}`;

  const countSql = `SELECT count(*)::bigint AS total ${PRODUCT_FROM} ${base.sql}`;

  const brandWhere = buildProductWhere(f, 'brand');
  const priceWhere = buildProductWhere(f, 'price');
  const ratingWhere = buildProductWhere(f, 'rating');

  const [items, count, brands, price, ratings] = await Promise.all([
    query(itemsSql, pageParams),
    query(countSql, base.params),
    query(
      `SELECT p.brand AS value, count(*)::bigint AS count ${PRODUCT_FROM} ${brandWhere.sql}
       GROUP BY p.brand ORDER BY count DESC, p.brand ASC LIMIT 60`,
      brandWhere.params,
    ),
    query(
      `SELECT coalesce(min(p.price_cents), 0)::bigint AS min_cents,
              coalesce(max(p.price_cents), 0)::bigint AS max_cents
       ${PRODUCT_FROM} ${priceWhere.sql}`,
      priceWhere.params,
    ),
    // "4 stars & up" style buckets. Each bucket is counted with every other
    // filter applied but the rating filter dropped.
    query(
      `SELECT t.value,
              (SELECT count(*)::bigint ${PRODUCT_FROM}
               ${ratingWhere.sql ? `${ratingWhere.sql} AND` : 'WHERE'} p.rating >= t.value) AS count
       FROM (VALUES (4.5),(4.0),(3.5),(3.0)) AS t(value)
       ORDER BY t.value DESC`,
      ratingWhere.params,
    ),
  ]);

  const total = Number(count.rows[0].total);
  return {
    items: items.rows.map(toProductCard),
    page: f.page,
    pageSize: f.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / f.pageSize)),
    facets: {
      brands: brands.rows.map((r) => ({ value: r.value, count: Number(r.count) })),
      priceRange: { minCents: Number(price.rows[0].min_cents), maxCents: Number(price.rows[0].max_cents) },
      ratings: ratings.rows.map((r) => ({ value: Number(r.value), count: Number(r.count) })),
    },
  };
}
