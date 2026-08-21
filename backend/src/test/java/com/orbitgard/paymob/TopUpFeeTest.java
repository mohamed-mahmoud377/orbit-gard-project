package com.orbitgard.paymob;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The fee decides what a real card is charged, so the arithmetic is pinned
 * here rather than left to be inferred from the one worked example.
 */
class TopUpFeeTest {

    @ParameterizedTest(name = "credit {0} → fee {1}, charge {2}")
    @CsvSource({
            // The example this was specified from: add 1,000, pay 1,010.
            "100000, 1000, 101000",
            // The advertised minimum: EGP 50 → 50 piastres → EGP 50.50.
            "5000,     50,   5050",
            "10000,   100,  10100",
            "25000,   250,  25250",
            "50000,   500,  50500",
            "200000, 2000, 202000",
            // The advertised maximum. The charge is 2,020,000 — above the
            // old chk_payment_amount ceiling of 2,000,000, which is why V15
            // widens it. If this row ever fails to insert, that constraint
            // has been reverted.
            "2000000, 20000, 2020000",
    })
    void computesFeeAndChargeInMinorUnits(int creditCents, int expectedFee, int expectedCharge) {
        assertThat(TopUpFee.feeCents(creditCents)).isEqualTo(expectedFee);
        assertThat(TopUpFee.chargeCents(creditCents)).isEqualTo(expectedCharge);
    }

    @Test
    @DisplayName("rounds half up, so a fractional cent never rounds the fee away")
    void roundsHalfUp() {
        // 1% of 12,345 cents is 123.45 → 123.
        assertThat(TopUpFee.feeCents(12345)).isEqualTo(123);
        // 1% of 12,350 cents is 123.50 → 124, not 123.
        assertThat(TopUpFee.feeCents(12350)).isEqualTo(124);
        // 1% of 12,355 cents is 123.55 → 124.
        assertThat(TopUpFee.feeCents(12355)).isEqualTo(124);
    }

    @Test
    @DisplayName("the charge is always strictly greater than the credit")
    void chargeAlwaysExceedsCredit() {
        // Anything Orbit will accept is at least EGP 50, where 1% is already
        // half a pound — the fee can never round to nothing in that range.
        for (int credit = 5000; credit <= 2000000; credit += 4999) {
            assertThat(TopUpFee.chargeCents(credit))
                    .as("charge for credit %d", credit)
                    .isGreaterThan(credit);
        }
    }
}
