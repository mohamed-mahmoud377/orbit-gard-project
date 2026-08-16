import express from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { validate, asyncHandler } from '../middleware/validate.js';
import { requireAuth, signToken, publicUser } from '../middleware/auth.js';
import { AppError, conflict, unauthorized } from '../lib/errors.js';

export const authRouter = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a minute and try again.' } },
});

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(255),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

authRouter.post(
  '/register',
  authLimiter,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;
    const passwordHash = await bcrypt.hash(password, config.bcryptRounds);

    let rows;
    try {
      ({ rows } = await query(
        'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, email, name, created_at',
        [name, email, passwordHash],
      ));
    } catch (err) {
      if (err.code === '23505') throw conflict('EMAIL_TAKEN', 'An account with that email already exists.');
      throw err;
    }

    await query('INSERT INTO carts (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [rows[0].id]);
    res.status(201).json({ token: signToken(rows[0]), user: publicUser(rows[0]) });
  }),
);

authRouter.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const { rows } = await query(
      'SELECT id, email, name, password_hash, created_at FROM users WHERE email = $1',
      [email],
    );
    const user = rows[0];

    // Always run a bcrypt comparison so a missing account and a wrong password
    // take the same time, and always answer with the same generic message.
    const matches = await bcrypt.compare(
      password,
      user?.password_hash ?? '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
    );
    if (!user || !matches) {
      throw unauthorized('INVALID_CREDENTIALS', 'That email and password combination is not right.');
    }

    await query('INSERT INTO carts (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
    res.json({ token: signToken(user), user: publicUser(user) });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: publicUser(req.user) });
  }),
);

authRouter.post(
  '/change-password',
  requireAuth,
  authLimiter,
  validate(z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(200) })),
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!(await bcrypt.compare(req.body.currentPassword, rows[0].password_hash))) {
      throw new AppError(400, 'INVALID_CURRENT_PASSWORD', 'That is not your current password.');
    }
    const hash = await bcrypt.hash(req.body.newPassword, config.bcryptRounds);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ ok: true });
  }),
);
