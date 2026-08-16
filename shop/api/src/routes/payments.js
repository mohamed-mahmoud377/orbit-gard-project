import express from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { query, withTransaction } from '../db/pool.js';
import { validate, asyncHandler } from '../middleware/validate.js';
import { AppError, badRequest, notFound, conflict } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { processCard } from '../services/card-processor.js';
import * as orbit from '../services/orbit-client.js';
import { lockPayableOrder, settlePaidOrder, recordFailedPayment, toOrder, toPayment, orderProductName } from '../services/orders.js';

/** Mounted at /orders/:id/pay — `mergeParams` is what carries `:id` through. */
export const paymentsRouter = express.Router({ mergeParams: true });

const payLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${req.user?.id ?? 'anon'}`,
  message: {
    error: { code: 'RATE_LIMITED', message: 'Too many payment attempts. Please wait a few minutes.' },
  },
});

const cardSchema = z.object({
  cardNumber: z.string().min(12).max(32),
  holderName: z.string().trim().min(1, 'Cardholder name is required').max(120),
  expMonth: z.coerce.number().int().min(1).max(12),
  expYear: z.coerce.number().int().min(0).max(2999),
  cvv: z.string().min(3).max(4),
});

const verifySchema = z.object({
  username: z.string().trim().min(1, 'Enter your Orbit username').max(120),
  password: z.string().min(1, 'Enter your Orbit password').max(200),
});

const confirmSchema = z.object({ sessionId: z.string().uuid('That payment session is not valid.') });

/** `omar123` -> `om••••23`. */
export function maskUsername(username) {
  const s = String(username ?? '');
  if (s.length <= 4) return `${s.slice(0, 1)}${'•'.repeat(Math.max(1, s.length - 1))}`;
  return `${s.slice(0, 2)}${'•'.repeat(Math.max(2, s.length - 4))}${s.slice(-2)}`;
}

/** Load an order for read, scoped to the caller. */
async function fetchOrder(orderId, userId) {
  const { rows } = await query('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [orderId, userId]);
  if (!rows[0]) throw notFound('ORDER_NOT_FOUND', 'We could not find that order.');
  return rows[0];
}

async function orderWithItems(orderId, userId) {
  const [order, items, payment] = await Promise.all([
    fetchOrder(orderId, userId),
    query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY name', [orderId]),
    query(
      `SELECT * FROM payments WHERE order_id = $1 ORDER BY (status = 'APPROVED') DESC, created_at DESC LIMIT 1`,
      [orderId],
    ),
  ]);
  return toOrder(order, items.rows, payment.rows[0] ?? null);
}

// =========================================================================
// Card (CONTRACT §7)
// =========================================================================

paymentsRouter.post(
  '/card',
  payLimiter,
  validate(cardSchema),
  asyncHandler(async (req, res) => {
    const orderId = req.params.id;

    // Fail fast before the artificial acquirer latency: no point making someone
    // wait 1.5 s to be told the order was already paid.
    await withTransaction((client) => lockPayableOrder(client, orderId, req.user.id));

    const result = await processCard(req.body);

    if (result.kind === 'INVALID') {
      throw badRequest('CARD_INVALID', 'Please check your card details.', { fieldErrors: result.fieldErrors });
    }

    if (result.kind === 'DECLINED') {
      await withTransaction(async (client) => {
        const order = await lockPayableOrder(client, orderId, req.user.id);
        await recordFailedPayment(client, order, {
          method: 'CARD',
          // A processing error is our side failing, a decline is the issuer's.
          status: result.code === 'CARD_PROCESSING_ERROR' ? 'ERROR' : 'DECLINED',
          code: result.code,
          message: result.message,
        });
        await client.query(
          `UPDATE orders SET payment_status = 'FAILED', payment_method = 'CARD' WHERE id = $1`,
          [order.id],
        );
      });
      throw new AppError(result.status, result.code, result.message);
    }

    const payload = await withTransaction(async (client) => {
      const order = await lockPayableOrder(client, orderId, req.user.id);
      const payment = await settlePaidOrder(client, order, {
        method: 'CARD',
        authCode: result.authCode,
        cardLast4: result.last4,
        cardBrand: result.brand,
      });
      return { orderId: order.id, payment };
    });

    res.json({
      order: await orderWithItems(payload.orderId, req.user.id),
      payment: toPayment(payload.payment),
    });
  }),
);

// =========================================================================
// Orbit wallet — step 1: verify (CONTRACT §8)
// =========================================================================

paymentsRouter.post(
  '/orbit/verify',
  payLimiter,
  validate(verifySchema),
  asyncHandler(async (req, res) => {
    const orderId = req.params.id;
    const order = await withTransaction((client) => lockPayableOrder(client, orderId, req.user.id));

    // Retrying must never leave two live tokens for one order.
    await query(
      `UPDATE orbit_sessions SET state = 'EXPIRED' WHERE order_id = $1 AND state = 'ACTIVE'`,
      [orderId],
    );

    let verified;
    try {
      verified = await orbit.verify({ username: req.body.username, password: req.body.password });
    } catch (err) {
      // No money can move during verification, so a timeout here is plain
      // unavailability — never the uncertain path, which is reserved for
      // /external/pay.
      if (err instanceof orbit.OrbitTransportError) {
        throw new AppError(orbit.ORBIT_UNAVAILABLE.status, orbit.ORBIT_UNAVAILABLE.code, orbit.ORBIT_UNAVAILABLE.message);
      }
      throw err;
    }

    const { rows } = await query(
      `INSERT INTO orbit_sessions (order_id, user_id, orbit_username, token, expires_at, state)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
       RETURNING id, expires_at`,
      [orderId, req.user.id, req.body.username, verified.verificationToken, verified.expiresAt],
    );

    // The token itself stays in the row and is never serialised out.
    res.json({
      sessionId: rows[0].id,
      maskedUsername: maskUsername(req.body.username),
      expiresAt: rows[0].expires_at.toISOString(),
      amountCents: Number(order.total_cents),
    });
  }),
);

// =========================================================================
// Orbit wallet — step 2: confirm (CONTRACT §8)
// =========================================================================

paymentsRouter.post(
  '/orbit/confirm',
  payLimiter,
  validate(confirmSchema),
  asyncHandler(async (req, res) => {
    const orderId = req.params.id;
    const userId = req.user.id;

    // ---- Phase 1: claim the session ------------------------------------
    // A short transaction that locks the order, validates the session and
    // stamps `attempted_at`. The stamp is the claim: whoever sets it owns the
    // in-flight call, so a double-submit cannot produce two debits. The HTTP
    // call deliberately happens *outside* this transaction — holding a row
    // lock for the whole 15 s Orbit timeout would pin a pool connection and
    // gain nothing that the claim does not already give us.
    const claim = await withTransaction(async (client) => {
      const order = await lockPayableOrder(client, orderId, userId);

      const { rows } = await client.query(
        'SELECT * FROM orbit_sessions WHERE id = $1 AND order_id = $2 AND user_id = $3 FOR UPDATE',
        [req.body.sessionId, orderId, userId],
      );
      const session = rows[0];
      if (!session) throw new orbit.OrbitBusinessError('TOKEN_INVALID');

      if (session.state === 'CONSUMED') throw new orbit.OrbitBusinessError('TOKEN_ALREADY_USED');
      if (session.state === 'EXPIRED' || new Date(session.expires_at).getTime() <= Date.now()) {
        await client.query(`UPDATE orbit_sessions SET state = 'EXPIRED' WHERE id = $1`, [session.id]);
        throw new orbit.OrbitBusinessError('TOKEN_EXPIRED');
      }
      if (session.state !== 'ACTIVE') throw new orbit.OrbitBusinessError('TOKEN_INVALID');
      if (session.attempted_at) {
        throw conflict(
          'ORBIT_PAYMENT_IN_PROGRESS',
          'A payment for this order is already going through. Give it a moment before trying again.',
        );
      }

      await client.query('UPDATE orbit_sessions SET attempted_at = now() WHERE id = $1', [session.id]);

      const { rows: countRows } = await client.query(
        'SELECT coalesce(sum(qty), 0)::int AS n FROM order_items WHERE order_id = $1',
        [orderId],
      );
      return { order, session, itemCount: countRows[0].n };
    });

    // ---- Phase 2: the call we cannot take back --------------------------
    let paid;
    try {
      paid = await orbit.pay({
        verificationToken: claim.session.token,
        merchantName: config.orbitMerchantName,
        productName: orderProductName(claim.order, claim.itemCount),
        totalCents: Number(claim.order.total_cents),
      });
    } catch (err) {
      await handleOrbitPayFailure(err, claim);
      throw err;
    }

    // ---- Phase 3: settle ------------------------------------------------
    const settled = await withTransaction(async (client) => {
      const order = await lockPayableOrder(client, orderId, userId);
      const payment = await settlePaidOrder(client, order, {
        method: 'ORBIT_WALLET',
        orbitTransactionId: paid.transactionId ? String(paid.transactionId) : null,
        orbitReference: paid.reference ?? null,
      });
      await client.query(`UPDATE orbit_sessions SET state = 'CONSUMED', token = '' WHERE id = $1`, [claim.session.id]);
      return payment;
    });

    res.json({
      order: await orderWithItems(orderId, userId),
      payment: toPayment(settled),
    });
  }),
);

/**
 * Everything that has to be written down when `/external/pay` did not come
 * back with a success. Split out because the uncertain branch is the one part
 * of this file that must not be got wrong.
 *
 * @param {any} err
 * @param {{ order: any, session: any }} claim
 */
async function handleOrbitPayFailure(err, claim) {
  const { order, session } = claim;

  // Timed out or the socket died after the request was on the wire. The wallet
  // may or may not have been debited, so the order goes on hold: not paid, not
  // failed, and explicitly not retryable. Never auto-retry here.
  if (err instanceof orbit.OrbitTransportError && err.delivered) {
    logger.error('orbit pay outcome unknown — order parked for review', {
      orderId: order.id,
      orderNumber: order.order_number,
      sessionId: session.id,
      reason: err.reason,
    });
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE orders SET status = 'NEEDS_REVIEW', payment_status = 'UNCERTAIN', payment_method = 'ORBIT_WALLET'
         WHERE id = $1`,
        [order.id],
      );
      await recordFailedPayment(client, order, {
        method: 'ORBIT_WALLET',
        status: 'ERROR',
        code: 'ORBIT_UNCERTAIN',
        message: `Lost contact with Orbit after the payment request was sent (${err.reason}).`,
      });
      await client.query(`UPDATE orbit_sessions SET state = 'FAILED' WHERE id = $1`, [session.id]);
    });
    return;
  }

  const sessionState = err?.sessionState ?? 'FAILED';
  // ACTIVE means Orbit rejected before redeeming the token, so the same session
  // is still good — clear the claim so the shopper can top up and try again.
  const stillUsable = sessionState === 'ACTIVE' && new Date(session.expires_at).getTime() > Date.now();

  await withTransaction(async (client) => {
    await recordFailedPayment(client, order, {
      method: 'ORBIT_WALLET',
      status: err instanceof orbit.OrbitBusinessError ? 'DECLINED' : 'ERROR',
      code: err?.code ?? 'ORBIT_UNAVAILABLE',
      message: err?.message ?? null,
    });

    if (stillUsable) {
      await client.query(`UPDATE orbit_sessions SET attempted_at = NULL WHERE id = $1`, [session.id]);
    } else {
      await client.query(`UPDATE orbit_sessions SET state = $2 WHERE id = $1`, [
        session.id,
        sessionState === 'ACTIVE' ? 'EXPIRED' : sessionState,
      ]);
    }

    await client.query(`UPDATE orders SET payment_status = 'FAILED', payment_method = 'ORBIT_WALLET' WHERE id = $1`, [
      order.id,
    ]);
  });

  if (stillUsable && err instanceof AppError) {
    err.details = { ...(err.details ?? {}), sessionRetryable: true, expiresAt: new Date(session.expires_at).toISOString() };
  }
}
