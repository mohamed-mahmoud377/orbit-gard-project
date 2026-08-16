import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { unauthorized } from '../lib/errors.js';
import { query } from '../db/pool.js';

/**
 * @param {{ id: string, email: string }} user
 * @returns {string}
 */
export function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
    issuer: 'orbit-bazaar',
  });
}

/** @param {import('express').Request} req */
function bearerFrom(req) {
  const header = req.get('authorization');
  if (!header) return null;
  const [scheme, token] = header.split(/\s+/);
  if (!/^bearer$/i.test(scheme ?? '') || !token) return null;
  return token;
}

/**
 * Populates `req.user` when a valid token is present, otherwise leaves it
 * undefined. Never rejects — for the ○ endpoints that behave differently when
 * signed in.
 */
export async function optionalAuth(req, _res, next) {
  const token = bearerFrom(req);
  if (!token) return next();
  try {
    const payload = jwt.verify(token, config.jwtSecret, { issuer: 'orbit-bazaar' });
    const { rows } = await query('SELECT id, email, name, created_at FROM users WHERE id = $1', [payload.sub]);
    if (rows[0]) req.user = rows[0];
  } catch {
    /* an unusable token is simply treated as "guest" here */
  }
  next();
}

/** Hard gate for the ● endpoints. */
export async function requireAuth(req, _res, next) {
  const token = bearerFrom(req);
  if (!token) return next(unauthorized('UNAUTHENTICATED', 'Please sign in to continue.'));

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { issuer: 'orbit-bazaar' });
  } catch (err) {
    const expired = err?.name === 'TokenExpiredError';
    return next(
      unauthorized(
        expired ? 'SESSION_EXPIRED' : 'UNAUTHENTICATED',
        expired ? 'Your session expired. Please sign in again.' : 'Please sign in to continue.',
      ),
    );
  }

  try {
    const { rows } = await query('SELECT id, email, name, created_at FROM users WHERE id = $1', [payload.sub]);
    if (!rows[0]) return next(unauthorized('UNAUTHENTICATED', 'Please sign in to continue.'));
    req.user = rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

/** @param {{id: string, email: string, name: string, created_at: Date}} row */
export function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}
