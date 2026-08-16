import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ORBIT_ERROR_MAP,
  ORBIT_UNAVAILABLE,
  ORBIT_UNCERTAIN,
  OrbitBusinessError,
  OrbitTransportError,
  classifyTransportFailure,
  extractOrbitCode,
  buildPayPayload,
  verify,
  pay,
} from '../src/services/orbit-client.js';

/** A fetch stub that answers once with the given status and problem+json body. */
function problemFetch(status, body) {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/problem+json' },
    });
}

const BASE = { baseUrl: 'http://orbit.test/api/v1', timeoutMs: 500 };

// ---------------------------------------------------------------------------
// The mapping table (CONTRACT §8)
// ---------------------------------------------------------------------------

const CONTRACT_TABLE = [
  ['INVALID_CREDENTIALS', 401, 'ORBIT_INVALID_CREDENTIALS', 'Wrong Orbit username or password.'],
  [
    'ACCOUNT_NOT_VERIFIED',
    403,
    'ORBIT_ACCOUNT_NOT_VERIFIED',
    "Your Orbit account isn't verified yet. Activate it from the Orbit app, then try again.",
  ],
  ['ACCOUNT_SUSPENDED', 403, 'ORBIT_ACCOUNT_SUSPENDED', 'Your Orbit account is suspended. Contact Orbit support.'],
  [
    'TOKEN_INVALID',
    400,
    'ORBIT_SESSION_INVALID',
    'That payment session is no longer valid. Please sign in to your wallet again.',
  ],
  [
    'TOKEN_EXPIRED',
    410,
    'ORBIT_SESSION_EXPIRED',
    'Your payment session expired. Wallet sign-in is valid for one hour — please sign in again.',
  ],
  ['TOKEN_ALREADY_USED', 409, 'ORBIT_SESSION_USED', 'This payment session was already used.'],
  [
    'INSUFFICIENT_BALANCE',
    402,
    'ORBIT_INSUFFICIENT_BALANCE',
    "Your Orbit wallet doesn't have enough balance for this order.",
  ],
  [
    'DAILY_LIMIT_EXCEEDED',
    422,
    'ORBIT_DAILY_LIMIT',
    'This purchase would go over the daily spending limit on your Orbit account.',
  ],
  [
    'MONTHLY_LIMIT_EXCEEDED',
    422,
    'ORBIT_MONTHLY_LIMIT',
    'This purchase would go over the monthly spending limit on your Orbit account.',
  ],
  [
    'MAX_PER_TRANSACTION_EXCEEDED',
    422,
    'ORBIT_PER_TXN_LIMIT',
    'This order is larger than the per-transaction limit on your Orbit account.',
  ],
  ['AMOUNT_INVALID', 400, 'ORBIT_AMOUNT_INVALID', "We couldn't charge this amount. Please refresh your cart."],
  [
    'FIELD_REQUIRED',
    400,
    'ORBIT_BAD_REQUEST',
    'Something was missing from the payment request. Please try again.',
  ],
];

test('every row of the contract mapping table is implemented exactly', () => {
  for (const [orbitCode, status, shopCode, message] of CONTRACT_TABLE) {
    const mapped = ORBIT_ERROR_MAP[orbitCode];
    assert.ok(mapped, `${orbitCode} is missing from ORBIT_ERROR_MAP`);
    assert.equal(mapped.status, status, `${orbitCode} status`);
    assert.equal(mapped.code, shopCode, `${orbitCode} shop code`);
    assert.equal(mapped.message, message, `${orbitCode} message`);
  }
  assert.equal(
    Object.keys(ORBIT_ERROR_MAP).length,
    CONTRACT_TABLE.length,
    'ORBIT_ERROR_MAP has entries the contract does not define',
  );
});

test('each mapped code drives the right orbit_sessions state transition', () => {
  // CONSUMED on success and on TOKEN_ALREADY_USED; EXPIRED on token expiry;
  // balance and limit rejections happen before the debit so the token survives.
  assert.equal(ORBIT_ERROR_MAP.TOKEN_ALREADY_USED.sessionState, 'CONSUMED');
  assert.equal(ORBIT_ERROR_MAP.TOKEN_EXPIRED.sessionState, 'EXPIRED');
  assert.equal(ORBIT_ERROR_MAP.INSUFFICIENT_BALANCE.sessionState, 'ACTIVE');
  assert.equal(ORBIT_ERROR_MAP.DAILY_LIMIT_EXCEEDED.sessionState, 'ACTIVE');
  assert.equal(ORBIT_ERROR_MAP.MONTHLY_LIMIT_EXCEEDED.sessionState, 'ACTIVE');
  assert.equal(ORBIT_ERROR_MAP.MAX_PER_TRANSACTION_EXCEEDED.sessionState, 'ACTIVE');
  assert.equal(ORBIT_ERROR_MAP.TOKEN_INVALID.sessionState, 'FAILED');
  assert.equal(ORBIT_ERROR_MAP.INVALID_CREDENTIALS.sessionState, 'FAILED');
});

test('an Orbit problem body is turned into the mapped shop error', async () => {
  for (const [orbitCode, status, shopCode, message] of CONTRACT_TABLE) {
    const httpStatus = orbitCode === 'INVALID_CREDENTIALS' ? 401 : 400;
    await assert.rejects(
      () =>
        pay(
          { verificationToken: 't', productName: 'Order JS-1 (1 item)', totalCents: 1000 },
          { ...BASE, fetchImpl: problemFetch(httpStatus, { code: orbitCode, title: orbitCode, status: httpStatus }) },
        ),
      (err) => {
        assert.ok(err instanceof OrbitBusinessError, `${orbitCode} should be a business error`);
        assert.equal(err.status, status);
        assert.equal(err.code, shopCode);
        assert.equal(err.message, message);
        assert.deepEqual(err.toJSON(), { error: { code: shopCode, message } });
        return true;
      },
    );
  }
});

test('a bean-validation body surfaces the specific field code, not FIELD_REQUIRED', () => {
  // Spring reports @Positive/@Digits on cashAmount as a FIELD_REQUIRED envelope
  // with the real reason in fieldErrors.
  assert.equal(
    extractOrbitCode({ code: 'FIELD_REQUIRED', fieldErrors: [{ field: 'cashAmount', code: 'AMOUNT_INVALID' }] }),
    'AMOUNT_INVALID',
  );
  assert.equal(
    extractOrbitCode({ code: 'FIELD_REQUIRED', fieldErrors: [{ field: 'productName', code: 'FIELD_REQUIRED' }] }),
    'FIELD_REQUIRED',
  );
  assert.equal(extractOrbitCode({ code: 'INSUFFICIENT_BALANCE' }), 'INSUFFICIENT_BALANCE');
  assert.equal(extractOrbitCode(null), null);
  assert.equal(extractOrbitCode({}), null);
});

// ---------------------------------------------------------------------------
// Failure classification
// ---------------------------------------------------------------------------

test('connection-level failures that never left the process are ORBIT_UNAVAILABLE', async () => {
  for (const code of ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH']) {
    const err = Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error(code), { code }) });
    assert.deepEqual(classifyTransportFailure(err), { delivered: false, reason: code.toLowerCase() });

    await assert.rejects(
      () => pay({ verificationToken: 't', productName: 'x', totalCents: 100 }, { ...BASE, fetchImpl: async () => { throw err; } }),
      (thrown) => {
        assert.ok(thrown instanceof OrbitTransportError);
        assert.equal(thrown.delivered, false);
        assert.equal(thrown.status, 502);
        assert.equal(thrown.code, 'ORBIT_UNAVAILABLE');
        assert.equal(thrown.message, ORBIT_UNAVAILABLE.message);
        return true;
      },
    );
  }
});

test('a 5xx from Orbit is ORBIT_UNAVAILABLE, not uncertain', async () => {
  for (const status of [500, 502, 503]) {
    await assert.rejects(
      () =>
        pay(
          { verificationToken: 't', productName: 'x', totalCents: 100 },
          { ...BASE, fetchImpl: async () => new Response('boom', { status }) },
        ),
      (err) => {
        assert.equal(err.code, 'ORBIT_UNAVAILABLE');
        assert.equal(err.delivered, false);
        return true;
      },
    );
  }
});

test('an unparseable or unmapped 4xx degrades to ORBIT_UNAVAILABLE', async () => {
  await assert.rejects(
    () =>
      pay(
        { verificationToken: 't', productName: 'x', totalCents: 100 },
        { ...BASE, fetchImpl: async () => new Response('<html>nope</html>', { status: 400 }) },
      ),
    (err) => err.code === 'ORBIT_UNAVAILABLE' && err.delivered === false,
  );

  await assert.rejects(
    () =>
      pay(
        { verificationToken: 't', productName: 'x', totalCents: 100 },
        { ...BASE, fetchImpl: problemFetch(418, { code: 'SOMETHING_NEW' }) },
      ),
    (err) => err.code === 'ORBIT_UNAVAILABLE',
  );
});

// ---------------------------------------------------------------------------
// The uncertain path (CONTRACT §8) — the one that must not be got wrong
// ---------------------------------------------------------------------------

test('a timeout on /external/pay is UNCERTAIN, never a plain failure', async () => {
  // A real AbortSignal.timeout firing against a fetch that never settles.
  //
  // The stub has to hold a ref'd handle for the same reason a real request does.
  // AbortSignal.timeout's internal timer is unref'd, so it cannot keep the
  // process alive on its own; a real in-flight fetch is held open by its socket.
  // Without a stand-in for that socket the event loop drains before the deadline,
  // the abort never fires, and node:test cancels this test and every one after it.
  const hangingFetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      const socket = setTimeout(() => {}, 30_000);
      init.signal.addEventListener('abort', () => {
        clearTimeout(socket);
        reject(init.signal.reason);
      });
    });

  const startedAt = Date.now();
  await assert.rejects(
    () =>
      pay({ verificationToken: 'secret-token', productName: 'Order JS-2026-000123 (3 items)', totalCents: 10492772 }, {
        baseUrl: 'http://orbit.test/api/v1',
        timeoutMs: 120,
        fetchImpl: hangingFetch,
      }),
    (err) => {
      assert.ok(err instanceof OrbitTransportError);
      assert.equal(err.delivered, true, 'a timeout means the request may have been processed');
      assert.equal(err.reason, 'timeout');
      assert.equal(err.status, 502);
      assert.equal(err.code, 'ORBIT_UNCERTAIN');
      assert.equal(err.message, ORBIT_UNCERTAIN.message);
      assert.match(err.message, /Check your Orbit transactions before paying again/);
      assert.match(err.message, /so you aren't charged twice/);
      return true;
    },
  );
  assert.ok(Date.now() - startedAt < 3000, 'the timeout must actually fire');
});

test('a socket that dies mid-flight is UNCERTAIN', () => {
  for (const code of ['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'UND_ERR_SOCKET']) {
    const err = Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error(code), { code }) });
    const classified = classifyTransportFailure(err);
    assert.equal(classified.delivered, true, `${code} must be treated as uncertain`);
  }

  const hangUp = Object.assign(new TypeError('fetch failed'), { cause: new Error('other side closed') });
  assert.deepEqual(classifyTransportFailure(hangUp), { delivered: true, reason: 'socket-closed' });
});

test('an unrecognised transport failure defaults to UNCERTAIN, never to success or failure', () => {
  assert.equal(classifyTransportFailure(new Error('who knows')).delivered, true);
  assert.equal(classifyTransportFailure(undefined).delivered, true);
});

test('AbortError is classified the same way as a timeout', () => {
  const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
  assert.deepEqual(classifyTransportFailure(abort), { delivered: true, reason: 'timeout' });
});

// ---------------------------------------------------------------------------
// Wire shape
// ---------------------------------------------------------------------------

test('the pay payload matches the shape the Spring backend validates', () => {
  const payload = buildPayPayload({
    verificationToken: 'jwt-value',
    merchantName: "Jerry's Shop",
    productName: 'Order JS-2026-000123 (3 items)',
    totalCents: 10492772,
  });
  assert.deepEqual(payload, {
    verificationToken: 'jwt-value',
    merchantName: "Jerry's Shop",
    productName: 'Order JS-2026-000123 (3 items)',
    cashAmount: 104927.72,
  });
  assert.equal(
    JSON.stringify(payload),
    '{"verificationToken":"jwt-value","merchantName":"Jerry\'s Shop","productName":"Order JS-2026-000123 (3 items)","cashAmount":104927.72}',
  );
});

test('merchantName and productName are truncated to the 255 the DTO allows', () => {
  const payload = buildPayPayload({
    verificationToken: 't',
    merchantName: 'M'.repeat(400),
    productName: 'P'.repeat(400),
    totalCents: 100,
  });
  assert.equal(payload.merchantName.length, 255);
  assert.equal(payload.productName.length, 255);
});

test('the request Orbit receives carries exactly two decimals', async () => {
  /** @type {any} */
  let seen;
  await pay(
    { verificationToken: 't', merchantName: "Jerry's Shop", productName: 'Order JS-1 (1 item)', totalCents: 815 },
    {
      ...BASE,
      fetchImpl: async (url, init) => {
        seen = { url, body: init.body };
        return new Response(JSON.stringify({ transactionId: 'tx-1', reference: 'REF1', status: 'COMPLETED' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      },
    },
  );
  assert.equal(seen.url, 'http://orbit.test/api/v1/external/pay');
  assert.match(seen.body, /"cashAmount":8\.15}/);
});

test('a successful pay is unwrapped into transaction identifiers', async () => {
  const result = await pay(
    { verificationToken: 't', productName: 'x', totalCents: 1000 },
    {
      ...BASE,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            transactionId: '9d2c-uuid',
            reference: 'ORB-REF-77',
            status: 'COMPLETED',
            cashAmount: 10.0,
            createdAt: '2026-08-16T10:00:00Z',
          }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        ),
    },
  );
  assert.equal(result.transactionId, '9d2c-uuid');
  assert.equal(result.reference, 'ORB-REF-77');
  assert.equal(result.status, 'COMPLETED');
});

test('verify posts credentials and returns the token plus expiry', async () => {
  /** @type {any} */
  let seen;
  const result = await verify(
    { username: 'omar123', password: 'MyPass123' },
    {
      ...BASE,
      fetchImpl: async (url, init) => {
        seen = { url, body: JSON.parse(init.body), method: init.method };
        return new Response(
          JSON.stringify({ verificationToken: 'jwt.here', expiresAt: '2026-08-16T11:00:00Z' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    },
  );
  assert.equal(seen.url, 'http://orbit.test/api/v1/external/verify');
  assert.equal(seen.method, 'POST');
  assert.deepEqual(seen.body, { username: 'omar123', password: 'MyPass123' });
  assert.deepEqual(result, { verificationToken: 'jwt.here', expiresAt: '2026-08-16T11:00:00Z' });
});

test('bad wallet credentials map to 401 ORBIT_INVALID_CREDENTIALS', async () => {
  await assert.rejects(
    () =>
      verify(
        { username: 'omar123', password: 'wrong' },
        { ...BASE, fetchImpl: problemFetch(401, { code: 'INVALID_CREDENTIALS', status: 401 }) },
      ),
    (err) => err.status === 401 && err.code === 'ORBIT_INVALID_CREDENTIALS',
  );
});

test('a verify response without a token is not treated as success', async () => {
  await assert.rejects(
    () =>
      verify(
        { username: 'omar123', password: 'x' },
        { ...BASE, fetchImpl: async () => new Response(JSON.stringify({ expiresAt: 'soon' }), { status: 200 }) },
      ),
    (err) => err instanceof OrbitTransportError && err.code === 'ORBIT_UNAVAILABLE',
  );
});
