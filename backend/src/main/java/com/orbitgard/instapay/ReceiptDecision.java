package com.orbitgard.instapay;

import com.orbitgard.enums.InstapayRejectionReason;

/**
 * What the rules concluded about one extraction.
 *
 * There are exactly two endings, and both are terminal. The model answered,
 * so the answer will not change on a second look: either the wallet is
 * credited or the row is rejected with a reason. FAILED is not in here on
 * purpose — FAILED means no answer was ever obtained, which is a transport
 * outcome decided before these rules are ever reached.
 *
 * creditCents is set only on CREDIT, and it is the transfer amount, never
 * the total. The distinction is worth a field rather than a comment: a
 * receipt showing Transfer 1.00, Fees 0.50, Total 1.50 must credit 100, and
 * crediting 150 is giving money away.
 */
public record ReceiptDecision(

        Outcome outcome,

        /** Null on CREDIT. */
        InstapayRejectionReason rejectionReason,

        /** Null on REJECT. The transfer amount in cents — never the total. */
        Long creditCents
) {

    public enum Outcome {
        CREDIT,
        REJECT
    }

    public static ReceiptDecision credit(long cents) {
        return new ReceiptDecision(Outcome.CREDIT, null, cents);
    }

    public static ReceiptDecision reject(InstapayRejectionReason reason) {
        return new ReceiptDecision(Outcome.REJECT, reason, null);
    }

    public boolean credited() {
        return outcome == Outcome.CREDIT;
    }
}
