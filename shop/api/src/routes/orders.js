import express from 'express';
import { z } from 'zod';
import { validate, asyncHandler } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { createOrder, listOrders, getOrder } from '../services/orders.js';
import { paymentsRouter } from './payments.js';

export const ordersRouter = express.Router();
ordersRouter.use(requireAuth);

const createSchema = z.object({
  addressId: z.string().uuid('Choose a delivery address'),
  shippingMethod: z.enum(['standard', 'express']).default('standard'),
});

ordersRouter.post(
  '/',
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const order = await createOrder(req.user.id, req.body);
    res.status(201).json({ order });
  }),
);

ordersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ items: await listOrders(req.user.id) });
  }),
);

ordersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json({ order: await getOrder(req.user.id, req.params.id) });
  }),
);

// /orders/:id/pay/*
ordersRouter.use('/:id/pay', paymentsRouter);
