import test from 'node:test';
import assert from 'node:assert/strict';
import {
  luhnCheck,
  detectBrand,
  isExpiryValid,
  isCvvValid,
  validateCard,
  decideOutcome,
  generateAuthCode,
  normalizePan,
  processCard,
  TEST_CARDS,
} from '../src/services/card-processor.js';

test('Luhn accepts known-good numbers', () => {
  for (const pan of [
    '4242424242424242',
    '4000000000000002',
    '4000000000009995',
    '4000000000000069',
    '4000000000000127',
    '4000000000000119',
    '5555555555554444',
    '378282246310005', // Amex, 15 digits
    '6200000000000005',
  ]) {
    assert.equal(luhnCheck(pan), true, `${pan} should pass Luhn`);
  }
});

test('Luhn rejects bad numbers, wrong lengths and non-digits', () => {
  assert.equal(luhnCheck('4242424242424241'), false);
  assert.equal(luhnCheck('1234567812345678'), false);
  assert.equal(luhnCheck('4242'), false); // too short
  assert.equal(luhnCheck('42424242424242424242'), false); // too long
  assert.equal(luhnCheck('4242abcd42424242'), false);
  assert.equal(luhnCheck(''), false);
});

test('spaces and dashes are stripped before anything else looks at the PAN', () => {
  assert.equal(normalizePan('4242 4242 4242 4242'), '4242424242424242');
  assert.equal(normalizePan('4242-4242-4242-4242'), '4242424242424242');
  assert.equal(luhnCheck(normalizePan('4242 4242 4242 4242')), true);
});

test('brand detection follows the IIN table in the contract', () => {
  assert.equal(detectBrand('4242424242424242'), 'Visa');
  assert.equal(detectBrand('5105105105105100'), 'Mastercard'); // 51
  assert.equal(detectBrand('5555555555554444'), 'Mastercard'); // 55
  assert.equal(detectBrand('2221000000000009'), 'Mastercard'); // low edge of the 2-series
  assert.equal(detectBrand('2720999999999999'), 'Mastercard'); // high edge
  assert.equal(detectBrand('2220999999999999'), 'Unknown'); // just below 2221
  assert.equal(detectBrand('2721000000000000'), 'Unknown'); // just above 2720
  assert.equal(detectBrand('342222222222222'), 'Amex');
  assert.equal(detectBrand('372222222222222'), 'Amex');
  assert.equal(detectBrand('6200000000000005'), 'UnionPay');
  assert.equal(detectBrand('9999999999999999'), 'Unknown');
});

test('a card is valid through the last day of its expiry month', () => {
  const june2026 = new Date('2026-06-15T12:00:00Z');
  assert.equal(isExpiryValid(6, 2026, june2026), true); // this month
  assert.equal(isExpiryValid(7, 2026, june2026), true);
  assert.equal(isExpiryValid(5, 2026, june2026), false); // last month
  assert.equal(isExpiryValid(12, 2025, june2026), false);
  assert.equal(isExpiryValid(6, 26, june2026), true); // 2-digit year
  assert.equal(isExpiryValid(0, 2027, june2026), false);
  assert.equal(isExpiryValid(13, 2027, june2026), false);

  const lastInstant = new Date('2026-06-30T23:59:59.999Z');
  assert.equal(isExpiryValid(6, 2026, lastInstant), true);
  assert.equal(isExpiryValid(6, 2026, new Date('2026-07-01T00:00:00.000Z')), false);
});

test('CVV length depends on the brand', () => {
  assert.equal(isCvvValid('123', 'Visa'), true);
  assert.equal(isCvvValid('1234', 'Visa'), false);
  assert.equal(isCvvValid('1234', 'Amex'), true);
  assert.equal(isCvvValid('123', 'Amex'), false);
  assert.equal(isCvvValid('12', 'Visa'), false);
  assert.equal(isCvvValid('12a', 'Visa'), false);
  assert.equal(isCvvValid('', 'Visa'), false);
});

test('validateCard reports every bad field at once', () => {
  const now = new Date('2026-06-15T12:00:00Z');
  const result = validateCard(
    { cardNumber: '4242424242424241', holderName: '  ', expMonth: 1, expYear: 2020, cvv: '1' },
    now,
  );
  assert.equal(result.ok, false);
  assert.deepEqual(Object.keys(result.fieldErrors).sort(), ['cardNumber', 'cvv', 'expYear', 'holderName']);
  assert.equal(result.fieldErrors.cardNumber, 'Card number is invalid');
});

test('validateCard passes a good card and exposes only brand and last4', () => {
  const result = validateCard(
    { cardNumber: '4242 4242 4242 4242', holderName: 'Mona Said', expMonth: 12, expYear: 2030, cvv: '123' },
    new Date('2026-06-15T12:00:00Z'),
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.fieldErrors, {});
  assert.equal(result.brand, 'Visa');
  assert.equal(result.last4, '4242');
});

test('every scripted test card produces its contracted outcome', () => {
  const expected = {
    '4242424242424242': { approved: true, status: 200, code: 'APPROVED' },
    '4000000000000002': { approved: false, status: 402, code: 'CARD_DECLINED' },
    '4000000000009995': { approved: false, status: 402, code: 'CARD_INSUFFICIENT_FUNDS' },
    '4000000000000069': { approved: false, status: 402, code: 'CARD_EXPIRED' },
    '4000000000000127': { approved: false, status: 402, code: 'CARD_INCORRECT_CVC' },
    '4000000000000119': { approved: false, status: 502, code: 'CARD_PROCESSING_ERROR' },
  };

  for (const [pan, want] of Object.entries(expected)) {
    const got = decideOutcome(pan);
    assert.equal(got.approved, want.approved, `${pan} approved flag`);
    assert.equal(got.status, want.status, `${pan} status`);
    assert.equal(got.code, want.code, `${pan} code`);
    assert.ok(got.message.length > 0, `${pan} needs a user-facing message`);
  }

  assert.equal(TEST_CARDS['4000000000000002'].message, 'Your card was declined by the issuer.');
});

test('any other Luhn-valid card is approved', () => {
  for (const pan of ['5555555555554444', '378282246310005', '6200000000000005', '4111111111111111']) {
    assert.equal(decideOutcome(pan).approved, true, `${pan} should be approved`);
  }
});

test('auth codes are 8 uppercase hex characters and do not repeat', () => {
  const codes = new Set();
  for (let i = 0; i < 200; i++) {
    const code = generateAuthCode();
    assert.match(code, /^[0-9A-F]{8}$/);
    codes.add(code);
  }
  assert.ok(codes.size > 190, 'auth codes should be effectively unique');
});

test('processCard short-circuits on invalid input without waiting for the acquirer', async () => {
  const startedAt = Date.now();
  const result = await processCard({
    cardNumber: '4242424242424241',
    holderName: 'Mona Said',
    expMonth: 12,
    expYear: 2030,
    cvv: '123',
  });
  assert.equal(result.kind, 'INVALID');
  assert.ok(result.fieldErrors.cardNumber);
  assert.ok(Date.now() - startedAt < 400, 'validation failures must not pay the latency cost');
});

test('processCard approves and declines with the right shape', async () => {
  const good = await processCard(
    { cardNumber: '4242424242424242', holderName: 'Mona Said', expMonth: 12, expYear: 2030, cvv: '123' },
    { skipLatency: true },
  );
  assert.equal(good.ok, true);
  assert.equal(good.kind, 'APPROVED');
  assert.equal(good.brand, 'Visa');
  assert.equal(good.last4, '4242');
  assert.match(good.authCode, /^[0-9A-F]{8}$/);
  assert.ok(!('cardNumber' in good) && !('pan' in good), 'the PAN must never leave the processor');

  const bad = await processCard(
    { cardNumber: '4000000000009995', holderName: 'Mona Said', expMonth: 12, expYear: 2030, cvv: '123' },
    { skipLatency: true },
  );
  assert.equal(bad.ok, false);
  assert.equal(bad.kind, 'DECLINED');
  assert.equal(bad.code, 'CARD_INSUFFICIENT_FUNDS');
  assert.equal(bad.status, 402);
  assert.equal(bad.last4, '9995');
});

test('processCard really does sleep for the acquirer window', async () => {
  const startedAt = Date.now();
  await processCard(
    { cardNumber: '4242424242424242', holderName: 'Mona Said', expMonth: 12, expYear: 2030, cvv: '123' },
    {},
  );
  const elapsed = Date.now() - startedAt;
  assert.ok(elapsed >= 800, `expected at least 800ms, got ${elapsed}`);
  assert.ok(elapsed <= 2200, `expected at most ~1500ms, got ${elapsed}`);
});
