import express from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.js';
import { validate, asyncHandler } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { notFound } from '../lib/errors.js';

export const addressesRouter = express.Router();
addressesRouter.use(requireAuth);

const addressSchema = z.object({
  label: z.string().trim().max(40).optional(),
  fullName: z.string().trim().min(2, 'Enter the recipient name').max(120),
  phone: z
    .string()
    .trim()
    .regex(/^(\+?20|0)?1[0125]\d{8}$/, 'Enter a valid Egyptian mobile number'),
  line1: z.string().trim().min(3, 'Enter the street address').max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(2, 'Enter the city').max(100),
  governorate: z.string().trim().min(2, 'Choose a governorate').max(100),
  postalCode: z.string().trim().max(20).optional(),
  isDefault: z.boolean().default(false),
});

const patchSchema = addressSchema.partial();

const toAddress = (r) => ({
  id: r.id,
  label: r.label,
  fullName: r.full_name,
  phone: r.phone,
  line1: r.line1,
  line2: r.line2,
  city: r.city,
  governorate: r.governorate,
  postalCode: r.postal_code,
  isDefault: r.is_default,
  createdAt: r.created_at?.toISOString?.() ?? r.created_at,
});

addressesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      'SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC',
      [req.user.id],
    );
    res.json({ items: rows.map(toAddress) });
  }),
);

addressesRouter.post(
  '/',
  validate(addressSchema),
  asyncHandler(async (req, res) => {
    const a = req.body;
    const row = await withTransaction(async (client) => {
      const { rows: existing } = await client.query(
        'SELECT count(*)::int AS n FROM addresses WHERE user_id = $1',
        [req.user.id],
      );
      // The first address a user saves is their default whether they asked or not.
      const isDefault = a.isDefault || existing[0].n === 0;
      if (isDefault) {
        await client.query('UPDATE addresses SET is_default = false WHERE user_id = $1', [req.user.id]);
      }
      const { rows } = await client.query(
        `INSERT INTO addresses (user_id, label, full_name, phone, line1, line2, city, governorate, postal_code, is_default)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [req.user.id, a.label ?? null, a.fullName, a.phone, a.line1, a.line2 ?? null, a.city, a.governorate, a.postalCode ?? null, isDefault],
      );
      return rows[0];
    });
    res.status(201).json({ address: toAddress(row) });
  }),
);

addressesRouter.patch(
  '/:id',
  validate(patchSchema),
  asyncHandler(async (req, res) => {
    const a = req.body;
    const row = await withTransaction(async (client) => {
      const { rows: owned } = await client.query('SELECT * FROM addresses WHERE id = $1 AND user_id = $2', [
        req.params.id,
        req.user.id,
      ]);
      if (!owned[0]) throw notFound('ADDRESS_NOT_FOUND', 'We could not find that address.');
      if (a.isDefault === true) {
        await client.query('UPDATE addresses SET is_default = false WHERE user_id = $1', [req.user.id]);
      }
      const { rows } = await client.query(
        `UPDATE addresses SET
           label = COALESCE($3, label), full_name = COALESCE($4, full_name), phone = COALESCE($5, phone),
           line1 = COALESCE($6, line1), line2 = COALESCE($7, line2), city = COALESCE($8, city),
           governorate = COALESCE($9, governorate), postal_code = COALESCE($10, postal_code),
           is_default = COALESCE($11, is_default)
         WHERE id = $1 AND user_id = $2 RETURNING *`,
        [
          req.params.id, req.user.id, a.label ?? null, a.fullName ?? null, a.phone ?? null,
          a.line1 ?? null, a.line2 ?? null, a.city ?? null, a.governorate ?? null,
          a.postalCode ?? null, a.isDefault ?? null,
        ],
      );
      return rows[0];
    });
    res.json({ address: toAddress(row) });
  }),
);

addressesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rowCount } = await query('DELETE FROM addresses WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user.id,
    ]);
    if (rowCount === 0) throw notFound('ADDRESS_NOT_FOUND', 'We could not find that address.');
    res.json({ ok: true });
  }),
);
