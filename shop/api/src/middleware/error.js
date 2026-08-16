import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

/** 404 for anything under /shop/api that no route claimed. */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `No such endpoint: ${req.method} ${req.originalUrl}` },
  });
}

/* eslint-disable-next-line no-unused-vars -- Express identifies error middleware by arity */
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof AppError) {
    if (err.status >= 500) {
      logger.error('request failed', { path: req.originalUrl, code: err.code, message: err.message });
    }
    return res.status(err.status).json(err.toJSON());
  }

  // Body-parser rejects malformed JSON with a SyntaxError carrying `status`.
  if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({
      error: { code: 'MALFORMED_REQUEST', message: 'The request body could not be read as JSON.' },
    });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'That request was too large.' } });
  }

  logger.error('unhandled request failure', {
    path: req.originalUrl,
    method: req.method,
    message: err?.message,
    stack: err?.stack,
  });
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side. Please try again.' },
  });
}
