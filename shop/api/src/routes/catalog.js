import express from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { validate, asyncHandler } from '../middleware/validate.js';
import { notFound } from '../lib/errors.js';
import { PRODUCT_COLUMNS, PRODUCT_FROM, toProduct, toProductCard, searchProducts } from '../services/catalog.js';

export const catalogRouter = express.Router();

const asArray = (v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]);
const intFrom = (v) => (v === undefined || v === '' ? undefined : Number(v));

export const productQuerySchema = z.object({
  q: z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : undefined), z.string().optional()),
  category: z.string().trim().min(1).max(80).optional(),
  subcategory: z.string().trim().min(1).max(80).optional(),
  brand: z.preprocess(asArray, z.array(z.string().trim().min(1).max(80)).max(30).optional()),
  minPrice: z.preprocess(intFrom, z.number().int().nonnegative().optional()),
  maxPrice: z.preprocess(intFrom, z.number().int().nonnegative().optional()),
  minRating: z.preprocess(intFrom, z.number().min(0).max(5).optional()),
  badge: z.enum(['BEST_SELLER', 'NEW', 'DEAL', 'LIMITED']).optional(),
  inStock: z.preprocess((v) => v === true || v === 'true' || v === '1', z.boolean()).optional(),
  sort: z.enum(['relevance', 'newest', 'price_asc', 'price_desc', 'rating', 'popular']).default('relevance'),
  page: z.preprocess((v) => intFrom(v) ?? 1, z.number().int().min(1).max(1000)).default(1),
  pageSize: z.preprocess((v) => intFrom(v) ?? 24, z.number().int().min(1).max(60)).default(24),
});

catalogRouter.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(`
      SELECT c.id, c.slug, c.name, c.tagline, c.icon, c.accent, c.hero_image, c.sort_order,
             (SELECT count(*)::bigint FROM products p WHERE p.category_id = c.id) AS product_count,
             COALESCE((
               SELECT jsonb_agg(sub ORDER BY sub->>'sortOrder', sub->>'name')
               FROM (
                 SELECT jsonb_build_object(
                          'id', s.id, 'slug', s.slug, 'name', s.name, 'sortOrder', s.sort_order,
                          'productCount', (SELECT count(*) FROM products p WHERE p.subcategory_id = s.id)
                        ) AS sub
                 FROM subcategories s WHERE s.category_id = c.id
               ) t
             ), '[]'::jsonb) AS subcategories
      FROM categories c
      ORDER BY c.sort_order, c.name`);

    res.json({
      items: rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        tagline: r.tagline,
        icon: r.icon,
        accent: r.accent,
        heroImage: r.hero_image,
        productCount: Number(r.product_count),
        subcategories: (r.subcategories ?? []).map((s) => ({
          id: s.id,
          slug: s.slug,
          name: s.name,
          productCount: Number(s.productCount ?? 0),
        })),
      })),
    });
  }),
);

catalogRouter.get(
  '/products',
  validate(productQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await searchProducts(req.validatedQuery));
  }),
);

catalogRouter.get(
  '/products/:slug',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT ${PRODUCT_COLUMNS}, p.category_id, p.subcategory_id ${PRODUCT_FROM} WHERE p.slug = $1`,
      [req.params.slug],
    );
    if (!rows[0]) throw notFound('PRODUCT_NOT_FOUND', 'That product is no longer available.');
    const product = toProduct(rows[0]);

    // Prefer siblings in the same subcategory, fall back to the category, and
    // rank by price proximity so the strip reads as genuine alternatives.
    const { rows: related } = await query(
      `SELECT ${PRODUCT_COLUMNS} ${PRODUCT_FROM}
       WHERE p.id <> $1
         AND (($2::uuid IS NOT NULL AND p.subcategory_id = $2) OR ($2::uuid IS NULL AND p.category_id = $3))
       ORDER BY abs(p.price_cents - $4::bigint), p.rating DESC
       LIMIT 8`,
      [rows[0].id, rows[0].subcategory_id, rows[0].category_id, rows[0].price_cents],
    );

    res.json({ product, related: related.map(toProductCard) });
  }),
);
