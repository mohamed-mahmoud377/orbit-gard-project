import express from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.js';
import { validate, asyncHandler } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { notFound, conflict } from '../lib/errors.js';
import { ensureCart, getCart } from '../services/cart.js';

export const cartRouter = express.Router();
cartRouter.use(requireAuth);

const MAX_QTY = 20;

const shippingQuery = z.object({
  shippingMethod: z.enum(['standard', 'express']).default('standard'),
});

const addSchema = z.object({
  productId: z.string().uuid('Unknown product'),
  qty: z.number().int().min(1).max(MAX_QTY).default(1),
});

const patchSchema = z.object({ qty: z.number().int().min(0).max(MAX_QTY) });

const mergeSchema = z.object({
  items: z
    .array(z.object({ productId: z.string().uuid(), qty: z.number().int().min(1).max(MAX_QTY) }))
    .max(100)
    .default([]),
});

/** @param {import('pg').PoolClient|{query:Function}} db */
async function requireProduct(db, productId) {
  const { rows } = await db.query('SELECT id, stock FROM products WHERE id = $1', [productId]);
  if (!rows[0]) throw notFound('PRODUCT_NOT_FOUND', 'That product is no longer available.');
  return rows[0];
}

cartRouter.get(
  '/',
  validate(shippingQuery, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await getCart(req.user.id, req.validatedQuery.shippingMethod));
  }),
);

cartRouter.post(
  '/items',
  validate(addSchema),
  asyncHandler(async (req, res) => {
    await withTransaction(async (client) => {
      const product = await requireProduct(client, req.body.productId);
      // Refuse up front rather than letting a dead line sit in the cart until
      // checkout. Stock dropping *after* this point is a different problem, and
      // is caught by the OUT_OF_STOCK check when the order is created.
      if (product.stock === 0) {
        throw conflict('OUT_OF_STOCK', 'That product just went out of stock.');
      }
      const cartId = await ensureCart(client, req.user.id);
      await client.query(
        `INSERT INTO cart_items (cart_id, product_id, qty) VALUES ($1, $2, $3)
         ON CONFLICT (cart_id, product_id)
         DO UPDATE SET qty = LEAST($4::int, cart_items.qty + EXCLUDED.qty)`,
        [cartId, product.id, req.body.qty, MAX_QTY],
      );
    });
    res.status(201).json(await getCart(req.user.id));
  }),
);

cartRouter.patch(
  '/items/:productId',
  validate(patchSchema),
  asyncHandler(async (req, res) => {
    const cartId = await ensureCart({ query }, req.user.id);
    if (req.body.qty === 0) {
      await query('DELETE FROM cart_items WHERE cart_id = $1 AND product_id = $2', [cartId, req.params.productId]);
    } else {
      const { rowCount } = await query(
        'UPDATE cart_items SET qty = $3 WHERE cart_id = $1 AND product_id = $2',
        [cartId, req.params.productId, req.body.qty],
      );
      if (rowCount === 0) throw notFound('CART_ITEM_NOT_FOUND', 'That item is not in your cart.');
    }
    res.json(await getCart(req.user.id));
  }),
);

cartRouter.delete(
  '/items/:productId',
  asyncHandler(async (req, res) => {
    const cartId = await ensureCart({ query }, req.user.id);
    await query('DELETE FROM cart_items WHERE cart_id = $1 AND product_id = $2', [cartId, req.params.productId]);
    res.json(await getCart(req.user.id));
  }),
);

cartRouter.delete(
  '/',
  asyncHandler(async (req, res) => {
    const cartId = await ensureCart({ query }, req.user.id);
    await query('DELETE FROM cart_items WHERE cart_id = $1', [cartId]);
    res.json(await getCart(req.user.id));
  }),
);

/**
 * Adopt a guest cart at login. Quantities are summed with whatever is already
 * server-side and capped, and unknown product ids are skipped rather than
 * failing the whole merge — a stale localStorage cart must never block sign-in.
 */
cartRouter.post(
  '/merge',
  validate(mergeSchema),
  asyncHandler(async (req, res) => {
    if (req.body.items.length > 0) {
      await withTransaction(async (client) => {
        const cartId = await ensureCart(client, req.user.id);
        await client.query(
          `INSERT INTO cart_items (cart_id, product_id, qty)
           SELECT $1, p.id, LEAST($3::int, x.qty)
           FROM jsonb_to_recordset($2::jsonb) AS x(product_id uuid, qty integer)
           JOIN products p ON p.id = x.product_id
           ON CONFLICT (cart_id, product_id)
           DO UPDATE SET qty = LEAST($3::int, cart_items.qty + EXCLUDED.qty)`,
          [cartId, JSON.stringify(req.body.items.map((i) => ({ product_id: i.productId, qty: i.qty }))), MAX_QTY],
        );
      });
    }
    res.json(await getCart(req.user.id));
  }),
);
