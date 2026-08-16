import { config } from '../config.js';
import { AppError } from '../lib/errors.js';
import { centsToMajorNumber } from '../lib/money.js';
import { logger } from '../lib/logger.js';

/**
 * Server-to-server client for the Orbit banking API.
 *
 * The browser never talks to Orbit; the wallet password is posted here once and
 * the resulting verification token stays in `orbit_sessions`. Nothing in this
 * module logs the password or the token.
 */

/**
 * CONTRACT §8. Keyed by the `code` field of Orbit's RFC-7807 body.
 *
 * `sessionState` is what the local `orbit_sessions` row becomes:
 *  - CONSUMED — Orbit burned the token (success, or it was already burned)
 *  - EXPIRED  — the token is past its hour
 *  - ACTIVE   — Orbit rejected *before* redeeming, so the token is still usable
 *  - FAILED   — anything else; do not offer it again
 *
 * @type {Record<string, { status: number, code: string, message: string, sessionState: 'CONSUMED'|'EXPIRED'|'ACTIVE'|'FAILED' }>}
 */
export const ORBIT_ERROR_MAP = {
  INVALID_CREDENTIALS: {
    status: 401,
    code: 'ORBIT_INVALID_CREDENTIALS',
    message: 'Wrong Orbit username or password.',
    sessionState: 'FAILED',
  },
  ACCOUNT_NOT_VERIFIED: {
    status: 403,
    code: 'ORBIT_ACCOUNT_NOT_VERIFIED',
    message: "Your Orbit account isn't verified yet. Activate it from the Orbit app, then try again.",
    sessionState: 'FAILED',
  },
  ACCOUNT_SUSPENDED: {
    status: 403,
    code: 'ORBIT_ACCOUNT_SUSPENDED',
    message: 'Your Orbit account is suspended. Contact Orbit support.',
    sessionState: 'FAILED',
  },
  TOKEN_INVALID: {
    status: 400,
    code: 'ORBIT_SESSION_INVALID',
    message: 'That payment session is no longer valid. Please sign in to your wallet again.',
    sessionState: 'FAILED',
  },
  TOKEN_EXPIRED: {
    status: 410,
    code: 'ORBIT_SESSION_EXPIRED',
    message: 'Your payment session expired. Wallet sign-in is valid for one hour — please sign in again.',
    sessionState: 'EXPIRED',
  },
  TOKEN_ALREADY_USED: {
    status: 409,
    code: 'ORBIT_SESSION_USED',
    message: 'This payment session was already used.',
    sessionState: 'CONSUMED',
  },
  INSUFFICIENT_BALANCE: {
    status: 402,
    code: 'ORBIT_INSUFFICIENT_BALANCE',
    message: "Your Orbit wallet doesn't have enough balance for this order.",
    sessionState: 'ACTIVE',
  },
  DAILY_LIMIT_EXCEEDED: {
    status: 422,
    code: 'ORBIT_DAILY_LIMIT',
    message: 'This purchase would go over the daily spending limit on your Orbit account.',
    sessionState: 'ACTIVE',
  },
  MONTHLY_LIMIT_EXCEEDED: {
    status: 422,
    code: 'ORBIT_MONTHLY_LIMIT',
    message: 'This purchase would go over the monthly spending limit on your Orbit account.',
    sessionState: 'ACTIVE',
  },
  MAX_PER_TRANSACTION_EXCEEDED: {
    status: 422,
    code: 'ORBIT_PER_TXN_LIMIT',
    message: 'This order is larger than the per-transaction limit on your Orbit account.',
    sessionState: 'ACTIVE',
  },
  AMOUNT_INVALID: {
    status: 400,
    code: 'ORBIT_AMOUNT_INVALID',
    message: "We couldn't charge this amount. Please refresh your cart.",
    sessionState: 'FAILED',
  },
  FIELD_REQUIRED: {
    status: 400,
    code: 'ORBIT_BAD_REQUEST',
    message: 'Something was missing from the payment request. Please try again.',
    sessionState: 'FAILED',
  },
};

export const ORBIT_UNAVAILABLE = {
  status: 502,
  code: 'ORBIT_UNAVAILABLE',
  message: "We couldn't reach Orbit right now. Your order is saved — try paying again in a moment.",
  sessionState: 'ACTIVE',
};

export const ORBIT_UNCERTAIN = {
  status: 502,
  code: 'ORBIT_UNCERTAIN',
  message:
    'We lost contact with Orbit while your payment was going through. Check your Orbit transactions before ' +
    "paying again — this order is on hold so you aren't charged twice.",
  sessionState: 'FAILED',
};

/** A code Orbit returned that we have an explicit mapping for. */
export class OrbitBusinessError extends AppError {
  /** @param {string} orbitCode */
  constructor(orbitCode) {
    const mapped = ORBIT_ERROR_MAP[orbitCode];
    super(mapped.status, mapped.code, mapped.message);
    this.name = 'OrbitBusinessError';
    this.orbitCode = orbitCode;
    this.sessionState = mapped.sessionState;
  }
}

/**
 * The call did not produce a mapped business answer.
 *
 * `delivered` is the whole point of this class:
 *   false — we never got the bytes onto the wire (connection refused, DNS, TLS)
 *           or Orbit answered with a definite 5xx. Retrying is safe.
 *   true  — the request left this process and then the socket died or the
 *           deadline passed. Orbit may or may not have debited the wallet.
 *           This is the uncertain path in CONTRACT §8.
 */
export class OrbitTransportError extends AppError {
  /**
   * @param {boolean} delivered
   * @param {string} reason
   * @param {Error} [cause]
   */
  constructor(delivered, reason, cause) {
    const shape = delivered ? ORBIT_UNCERTAIN : ORBIT_UNAVAILABLE;
    super(shape.status, shape.code, shape.message);
    this.name = 'OrbitTransportError';
    this.delivered = delivered;
    this.reason = reason;
    this.sessionState = shape.sessionState;
    if (cause) this.cause = cause;
  }
}

/** Errors that mean the request never reached Orbit. Retrying cannot double-charge. */
const NOT_SENT_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENETDOWN',
  'EACCES',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'UND_ERR_CONNECT_TIMEOUT',
]);

/**
 * Decide whether a thrown fetch failure means "never sent" or "sent, outcome
 * unknown". Anything we cannot positively classify as never-sent is treated as
 * uncertain, because assuming failure is the answer that can double-charge.
 *
 * @param {any} err
 * @returns {{ delivered: boolean, reason: string }}
 */
export function classifyTransportFailure(err) {
  const name = err?.name ?? '';
  if (name === 'TimeoutError' || name === 'AbortError') {
    return { delivered: true, reason: 'timeout' };
  }

  const codes = [err?.code, err?.cause?.code, err?.cause?.cause?.code].filter(Boolean);
  for (const code of codes) {
    if (NOT_SENT_CODES.has(code)) return { delivered: false, reason: String(code).toLowerCase() };
  }
  if (codes.length > 0) return { delivered: true, reason: String(codes[0]).toLowerCase() };

  const message = String(err?.cause?.message ?? err?.message ?? '');
  if (/other side closed|socket hang up|terminated/i.test(message)) {
    return { delivered: true, reason: 'socket-closed' };
  }
  return { delivered: true, reason: 'unknown-transport-error' };
}

/**
 * Pull the machine-readable code out of Orbit's problem+json.
 *
 * Bean-validation failures arrive as top-level `FIELD_REQUIRED` with the real
 * reason buried in `fieldErrors[].code` (that is how `@Positive`/`@Digits` on
 * `cashAmount` surface as `AMOUNT_INVALID`), so a mappable field code wins.
 *
 * @param {any} body
 * @returns {string|null}
 */
export function extractOrbitCode(body) {
  if (!body || typeof body !== 'object') return null;
  const fieldCode = Array.isArray(body.fieldErrors)
    ? body.fieldErrors.map((f) => f?.code).find((c) => c && c !== 'FIELD_REQUIRED' && c in ORBIT_ERROR_MAP)
    : null;
  if (fieldCode) return fieldCode;
  return typeof body.code === 'string' ? body.code : null;
}

/**
 * @param {string} path
 * @param {unknown} payload
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number, baseUrl?: string }} [opts]
 */
async function callOrbit(path, payload, opts = {}) {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? config.orbitTimeoutMs;
  const url = `${(opts.baseUrl ?? config.orbitApiBase).replace(/\/+$/, '')}${path}`;

  let response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, application/problem+json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const { delivered, reason } = classifyTransportFailure(err);
    logger.warn('orbit call failed at transport level', { path, delivered, reason });
    throw new OrbitTransportError(delivered, reason, err);
  }

  // Reachable and answering. Read the body; a body we cannot parse is still an
  // Orbit problem, not ours, so it degrades to ORBIT_UNAVAILABLE.
  let body = null;
  let parsed = true;
  try {
    const text = await response.text();
    body = text ? JSON.parse(text) : null;
  } catch {
    parsed = false;
  }

  if (response.ok) {
    if (!parsed || body === null) {
      logger.warn('orbit returned an unreadable success body', { path, status: response.status });
      throw new OrbitTransportError(false, 'unparseable-success-body');
    }
    return body;
  }

  if (response.status >= 500) {
    logger.warn('orbit returned 5xx', { path, status: response.status });
    throw new OrbitTransportError(false, `http-${response.status}`);
  }

  const orbitCode = parsed ? extractOrbitCode(body) : null;
  if (orbitCode && orbitCode in ORBIT_ERROR_MAP) {
    throw new OrbitBusinessError(orbitCode);
  }

  logger.warn('orbit returned an unmapped 4xx', { path, status: response.status, orbitCode });
  throw new OrbitTransportError(false, `unmapped-${response.status}-${orbitCode ?? 'nocode'}`);
}

/**
 * Step 1 — exchange wallet credentials for a one-hour verification token.
 *
 * @param {{ username: string, password: string }} credentials
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number, baseUrl?: string }} [opts]
 * @returns {Promise<{ verificationToken: string, expiresAt: string }>}
 */
export async function verify(credentials, opts = {}) {
  const body = await callOrbit(
    '/external/verify',
    { username: credentials.username, password: credentials.password },
    opts,
  );
  if (!body?.verificationToken) {
    throw new OrbitTransportError(false, 'verify-response-missing-token');
  }
  return { verificationToken: body.verificationToken, expiresAt: body.expiresAt };
}

/**
 * Step 2 — redeem the token and debit the wallet.
 *
 * `cashAmount` is built from a decimal string and JSON.parse'd back into a
 * number, so exactly two decimals reach the wire and no float artifact can
 * change the charged amount.
 *
 * @param {{ verificationToken: string, productName: string, totalCents: number, merchantName?: string }} input
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number, baseUrl?: string }} [opts]
 */
export async function pay(input, opts = {}) {
  const payload = buildPayPayload(input);
  const body = await callOrbit('/external/pay', payload, opts);
  return {
    transactionId: body?.transactionId ?? null,
    reference: body?.reference ?? null,
    status: body?.status ?? null,
    cashAmount: body?.cashAmount ?? null,
    createdAt: body?.createdAt ?? null,
  };
}

/**
 * Exposed separately so the exact wire shape is unit-testable.
 * @param {{ verificationToken: string, productName: string, totalCents: number, merchantName?: string }} input
 */
export function buildPayPayload(input) {
  return {
    verificationToken: input.verificationToken,
    merchantName: (input.merchantName ?? config.orbitMerchantName).slice(0, 255),
    productName: String(input.productName ?? '').slice(0, 255),
    cashAmount: centsToMajorNumber(input.totalCents),
  };
}
