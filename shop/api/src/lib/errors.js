/**
 * Every non-2xx body from this API is
 *   { error: { code, message, details? } }
 * (CONTRACT §5). AppError is the only way to produce one.
 */
export class AppError extends Error {
  /**
   * @param {number} status
   * @param {string} code
   * @param {string} message user-facing, safe to render verbatim
   * @param {Record<string, unknown>} [details]
   */
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  toJSON() {
    const error = { code: this.code, message: this.message };
    if (this.details !== undefined) error.details = this.details;
    return { error };
  }
}

export const badRequest = (code, message, details) => new AppError(400, code, message, details);
export const unauthorized = (code = 'UNAUTHORIZED', message = 'Please sign in to continue.') =>
  new AppError(401, code, message);
export const forbidden = (code = 'FORBIDDEN', message = 'You do not have access to this.') =>
  new AppError(403, code, message);
export const notFound = (code = 'NOT_FOUND', message = 'We could not find what you were looking for.') =>
  new AppError(404, code, message);
export const conflict = (code, message, details) => new AppError(409, code, message, details);

export const VALIDATION_FAILED = (fieldErrors) =>
  badRequest('VALIDATION_FAILED', 'Some of the details you entered are not valid.', { fieldErrors });
