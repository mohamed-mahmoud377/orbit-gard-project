package com.orbitgard.wallet;

import java.math.BigDecimal;
import java.math.RoundingMode;

public final class MoneyConverter {

    private MoneyConverter() {
    }

    public static BigDecimal centsToMajor(long cents) {
        return BigDecimal.valueOf(cents, 2);
    }

    public static long majorToCents(BigDecimal amount) {
        try {
            return amount.setScale(2, RoundingMode.UNNECESSARY).movePointRight(2).longValueExact();
        } catch (ArithmeticException ex) {
            throw new IllegalArgumentException("Amount not representable in minor units: " + amount);
        }
    }
}
