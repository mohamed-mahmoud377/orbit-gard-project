import { TOP_UP_FEE_PERCENT, topUpChargeMinor, topUpFeeMinor } from './money';

/**
 * These cases are the same table as TopUpFeeTest.java on the server.
 *
 * The two implementations are independent — Java BigDecimal there, integer
 * maths here — so they can drift, and the symptom of drift would be the
 * summary promising one total and the card being charged another. Keeping
 * the expectations identical means a change on either side breaks a test
 * rather than a customer's statement.
 */
describe('top-up fee', () => {
  it('is 1%', () => {
    expect(TOP_UP_FEE_PERCENT).toBe(1);
  });

  const CASES: readonly [number, number, number][] = [
    // credit,   fee,   charge
    [100000, 1000, 101000], // the worked example: add 1,000 → pay 1,010
    [5000, 50, 5050], // advertised minimum, EGP 50 → EGP 50.50
    [10000, 100, 10100],
    [25000, 250, 25250],
    [50000, 500, 50500],
    [200000, 2000, 202000],
    [2000000, 20000, 2020000], // advertised maximum
  ];

  for (const [credit, fee, charge] of CASES) {
    it(`credit ${credit} → fee ${fee}, charge ${charge}`, () => {
      expect(topUpFeeMinor(credit)).toBe(fee);
      expect(topUpChargeMinor(credit)).toBe(charge);
    });
  }

  it('rounds half up, matching BigDecimal HALF_UP on the server', () => {
    expect(topUpFeeMinor(12345)).toBe(123);
    expect(topUpFeeMinor(12350)).toBe(124);
    expect(topUpFeeMinor(12355)).toBe(124);
  });

  it('always charges more than it credits, across the whole accepted range', () => {
    for (let credit = 5000; credit <= 2000000; credit += 4999) {
      expect(topUpChargeMinor(credit)).toBeGreaterThan(credit);
    }
  });
});
