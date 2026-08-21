package com.orbitgard.paymob;

import java.math.BigDecimal;
import java.math.RoundingMode;


public final class TopUpFee {

    /** 1%. Expressed as a rate so the rounding below has one obvious meaning. */
    public static final BigDecimal RATE = new BigDecimal("0.01");

    private TopUpFee() {
    }


    public static int feeCents(int creditCents) {
        return BigDecimal.valueOf(creditCents)
                .multiply(RATE)
                .setScale(0, RoundingMode.HALF_UP)
                .intValueExact();
    }

    /** What the card is charged: the credit plus the fee. */
    public static int chargeCents(int creditCents) {
        return Math.addExact(creditCents, feeCents(creditCents));
    }
}
