package com.orbitgard.wallet;

import com.orbitgard.enums.TransactionDirection;
import com.orbitgard.enums.TransactionStatus;
import com.orbitgard.enums.TransactionType;

/**
 * ORB-011 rules for transaction status and type/direction pairing.
 */
public final class TransactionRules {

    /** EGP 5,000 — credits at or above this amount start as PENDING (except TOPUP). */
    public static final long PENDING_CREDIT_THRESHOLD_CENTS = 500_000L;

    private TransactionRules() {
    }

    public static TransactionStatus initialCreditStatus(TransactionType type, long amountCents) {
        if (type == TransactionType.TOPUP) {
            return TransactionStatus.COMPLETED;
        }
        if (amountCents >= PENDING_CREDIT_THRESHOLD_CENTS) {
            return TransactionStatus.PENDING;
        }
        return TransactionStatus.COMPLETED;
    }

    public static TransactionStatus initialDebitStatus() {
        return TransactionStatus.COMPLETED;
    }

    public static void validateTypeDirection(TransactionType type, TransactionDirection direction) {
        switch (type) {
            case PROMO, TOPUP -> {
                if (direction != TransactionDirection.CREDIT) {
                    throw new IllegalArgumentException(type + " transactions must be credits");
                }
            }
            case EXTERNAL_TRANSFER -> {
                if (direction != TransactionDirection.DEBIT) {
                    throw new IllegalArgumentException("EXTERNAL_TRANSFER transactions must be debits");
                }
            }
            case INTERNAL_TRANSFER -> {
                // credit or debit
            }
        }
    }

    public static void validateAmount(long amountCents) {
        if (amountCents <= 0) {
            throw new IllegalArgumentException("Amount must be positive");
        }
    }
}
