package com.orbitgard.wallet;

import com.orbitgard.exceptions.ErrorCode;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Single source of truth for the wallet_transaction description format.
 *
 * The description carries two parseable pieces: the merchant of an external
 * payment, and the reason a blocked attempt was refused. Writing and reading
 * them live here together so the format and its parser cannot drift — the
 * previous arrangement had the string built in ExternalPaymentServiceImpl
 * and taken apart in a mapper two packages away.
 *
 * The blocked suffix is appended, and appending is safe precisely because
 * merchantOf strips the suffix before it looks for the merchant marker.
 * Order of operations, not order of concatenation, is what keeps them apart.
 */
public final class TransactionDescriptions {

    /** Separates the product from the merchant in an external payment. */
    private static final String MERCHANT_MARKER = " From: ";

    /** Introduces the blocked suffix. */
    private static final String BLOCKED_MARKER = " | BLOCKED: ";

    /**
     * Introduces the bank reference on an InstaPay top-up.
     *
     * Deliberately not " | " — that prefix belongs to the blocked suffix,
     * and two markers that look alike is how a parser starts finding the
     * wrong one.
     */
    private static final String INSTAPAY_REFERENCE_MARKER = " - InstaPay ref: ";

    /**
     * Anchored at the end and restricted to the shape of an ErrorCode name,
     * so a merchant who names themselves "Cafe | BLOCKED: WHATEVER" cannot
     * inject a reason into the middle of a description.
     */
    private static final Pattern BLOCKED_SUFFIX =
            Pattern.compile(Pattern.quote(BLOCKED_MARKER) + "([A-Z][A-Z0-9_]*)$");

    private TransactionDescriptions() {
    }

    /** Byte-identical to what ExternalPaymentServiceImpl built inline before. */
    public static String externalPayment(String productName, String merchantName) {
        return "External payment: Bought " + productName.trim() + MERCHANT_MARKER + merchantName;
    }

    public static String internalTransferOut(String receiverUsername) {
        return "Transfer to @" + receiverUsername;
    }

    /**
     * An InstaPay top-up, carrying the reference number off the receipt.
     *
     * The reference is the thread that ties a line in the wallet back to a
     * real transfer at a real bank. Without it nobody can answer "where did
     * this money come from" six weeks later — which is a question that gets
     * asked precisely when it is hardest to reconstruct.
     *
     * There is no matching parser here, unlike the merchant and blocked
     * markers above. Nothing in Orbit reads the reference back out of a
     * description: the requests page reads it from the receipt row, where
     * it is a real column. This exists so a human reading the ledger can
     * follow the thread, and a parser with no caller would just be dead
     * code drifting out of step.
     */
    public static String instapayTopUp(String referenceNumber) {
        return "Wallet top-up" + INSTAPAY_REFERENCE_MARKER + referenceNumber;
    }

    /** Appends the refusal reason to whatever the attempt would have been described as. */
    public static String blocked(String baseDescription, ErrorCode reason) {
        String base = baseDescription == null ? "" : baseDescription;
        return base + BLOCKED_MARKER + reason.name();
    }

    /** The refusal reason, or null if this description has no blocked suffix. */
    public static String blockedReasonOf(String description) {
        if (description == null) {
            return null;
        }
        Matcher matcher = BLOCKED_SUFFIX.matcher(description);
        return matcher.find() ? matcher.group(1) : null;
    }

    /**
     * The merchant of an external payment, or null when the marker is absent.
     *
     * Strips any blocked suffix first — otherwise a blocked payment would
     * report its merchant as "School canteen | BLOCKED: DAILY_LIMIT_EXCEEDED".
     */
    public static String merchantOf(String description) {
        if (description == null) {
            return null;
        }

        String withoutSuffix = BLOCKED_SUFFIX.matcher(description).replaceFirst("");

        int marker = withoutSuffix.lastIndexOf(MERCHANT_MARKER);
        if (marker < 0) {
            return null;
        }

        String merchant = withoutSuffix.substring(marker + MERCHANT_MARKER.length()).trim();
        return merchant.isEmpty() ? null : merchant;
    }
}