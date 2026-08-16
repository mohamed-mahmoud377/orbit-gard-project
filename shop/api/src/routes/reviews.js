import express from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.js';
import { validate, asyncHandler } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { notFound, conflict } from '../lib/errors.js';

export const reviewsRouter = express.Router();

const reviewSchema = z.object({
  rating: z.number().int().min(1, 'Pick a rating from 1 to 5').max(5),
  title: z.string().trim().max(120).optional(),
  body: z.string().trim().max(4000).optional(),
});

const toReview = (r) => ({
  id: r.id,
  rating: r.rating,
  title: r.title,
  body: r.body,
  author: r.author_name,
  createdAt: r.created_at?.toISOString?.() ?? r.created_at,
});

async function productIdBySlug(slug) {
  const { rows } = await query('SELECT id FROM products WHERE slug = $1', [slug]);
  if (!rows[0]) throw notFound('PRODUCT_NOT_FOUND', 'That product is no longer available.');
  return rows[0].id;
}

/** GET /products/:slug/reviews ○ */
reviewsRouter.get(
  '/products/:slug/reviews',
  asyncHandler(async (req, res) => {
    const productId = await productIdBySlug(req.params.slug);
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 10));

    const [items, summary] = await Promise.all([
      query(
        `SELECT r.*, u.name AS author_name
         FROM reviews r JOIN users u ON u.id = r.user_id
         WHERE r.product_id = $1
         ORDER BY r.created_at DESC
         LIMIT $2 OFFSET $3`,
        [productId, pageSize, (page - 1) * pageSize],
      ),
      query(
        `SELECT count(*)::bigint AS total,
                coalesce(avg(rating), 0)::numeric(3,2) AS average,
                count(*) FILTER (WHERE rating = 5)::int AS c5,
                count(*) FILTER (WHERE rating = 4)::int AS c4,
                count(*) FILTER (WHERE rating = 3)::int AS c3,
                count(*) FILTER (WHERE rating = 2)::int AS c2,
                count(*) FILTER (WHERE rating = 1)::int AS c1
         FROM reviews WHERE product_id = $1`,
        [productId],
      ),
    ]);

    const s = summary.rows[0];
    res.json({
      items: items.rows.map(toReview),
      page,
      pageSize,
      total: Number(s.total),
      summary: {
        average: Number(s.average),
        counts: { 5: s.c5, 4: s.c4, 3: s.c3, 2: s.c2, 1: s.c1 },
      },
    });
  }),
);

/** POST /products/:slug/reviews ● — one per user per product. */
reviewsRouter.post(
  '/products/:slug/reviews',
  requireAuth,
  validate(reviewSchema),
  asyncHandler(async (req, res) => {
    const productId = await productIdBySlug(req.params.slug);
    const review = await withTransaction(async (client) => {
      let rows;
      try {
        ({ rows } = await client.query(
          `INSERT INTO reviews (product_id, user_id, rating, title, body)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [productId, req.user.id, req.body.rating, req.body.title ?? null, req.body.body ?? null],
        ));
      } catch (err) {
        if (err.code === '23505') {
          throw conflict('REVIEW_EXISTS', 'You have already reviewed this product.');
        }
        throw err;
      }

      // Keep the denormalised rating on `products` honest: it starts as the
      // seeded synthetic figure and is blended with real reviews as they land.
      await client.query(
        `UPDATE products p SET
           rating = round(((p.rating * p.rating_count) + $2) / (p.rating_count + 1)::numeric, 1),
           rating_count = p.rating_count + 1
         WHERE p.id = $1`,
        [productId, req.body.rating],
      );

      return { ...rows[0], author_name: req.user.name };
    });
    res.status(201).json({ review: toReview(review) });
  }),
);
