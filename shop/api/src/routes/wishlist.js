import express from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { validate, asyncHandler } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { notFound } from '../lib/errors.js';
import { PRODUCT_COLUMNS, toProductCard } from '../services/catalog.js';

export const wishlistRouter = express.Router();
wishlistRouter.use(requireAuth);

async function list(userId) {
  const { rows } = await query(
    `SELECT w.created_at AS added_at, ${PRODUCT_COLUMNS}
     FROM wishlist_items w
     JOIN products p ON p.id = w.product_id
     JOIN categories c ON c.id = p.category_id
     LEFT JOIN subcategories s ON s.id = p.subcategory_id
     WHERE w.user_id = $1
     ORDER BY w.created_at DESC`,
    [userId],
  );
  return {
    items: rows.map((r) => ({ product: toProductCard(r), addedAt: r.added_at?.toISOString?.() ?? r.added_at })),
    total: rows.length,
  };
}

wishlistRouter.get(
  '/',
  asyncHandler(async (req, res) => res.json(await list(req.user.id))),
);

wishlistRouter.post(
  '/',
  validate(z.object({ productId: z.string().uuid('Unknown product') })),
  asyncHandler(async (req, res) => {
    const { rowCount } = await query('SELECT 1 FROM products WHERE id = $1', [req.body.productId]);
    if (rowCount === 0) throw notFound('PRODUCT_NOT_FOUND', 'That product is no longer available.');
    await query(
      'INSERT INTO wishlist_items (user_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.user.id, req.body.productId],
    );
    res.status(201).json(await list(req.user.id));
  }),
);

wishlistRouter.delete(
  '/:productId',
  asyncHandler(async (req, res) => {
    await query('DELETE FROM wishlist_items WHERE user_id = $1 AND product_id = $2', [
      req.user.id,
      req.params.productId,
    ]);
    res.json(await list(req.user.id));
  }),
);
