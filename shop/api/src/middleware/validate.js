import { VALIDATION_FAILED } from '../lib/errors.js';

/**
 * Turn a ZodError into the `details.fieldErrors` map from CONTRACT §5.
 * @param {import('zod').ZodError} error
 */
export function fieldErrorsFrom(error) {
  /** @type {Record<string, string>} */
  const fieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_';
    if (!(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

/**
 * @param {import('zod').ZodTypeAny} schema
 * @param {'body'|'query'|'params'} source
 */
export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) return next(VALIDATION_FAILED(fieldErrorsFrom(result.error)));
    // Express 5 makes req.query a getter-only property, so validated values go
    // into a parallel slot instead of being written back.
    if (source === 'query') req.validatedQuery = result.data;
    else req[source] = result.data;
    next();
  };
}

/** Wrap an async handler so rejections reach the error middleware. */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
