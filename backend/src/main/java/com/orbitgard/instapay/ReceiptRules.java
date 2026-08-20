package com.orbitgard.instapay;

import com.orbitgard.receipt.ReceiptExtraction;
import com.orbitgard.wallet.MoneyConverter;
import org.springframework.stereotype.Component;

import java.util.Optional;

import static com.orbitgard.enums.InstapayRejectionReason.DUPLICATE_REFERENCE;
import static com.orbitgard.enums.InstapayRejectionReason.INVALID_AMOUNT;
import static com.orbitgard.enums.InstapayRejectionReason.NOTHING_READABLE;
import static com.orbitgard.enums.InstapayRejectionReason.NOT_A_RECEIPT;
import static com.orbitgard.enums.InstapayRejectionReason.REFERENCE_NOT_VISIBLE;
import static com.orbitgard.enums.InstapayRejectionReason.TRANSFER_NOT_SUCCESSFUL;
import static com.orbitgard.enums.InstapayRejectionReason.WRONG_RECIPIENT;

/**
 * The server's half of the bargain: the model extracts, this decides.
 *
 * Nothing in ReceiptReader compares a value against anything. Every
 * accept-or-reject decision Orbit makes about a receipt is made here, in
 * Java, against configuration — which is why the model is never told
 * Orbit's account name, its phone number or the amount limits. A model that
 * knows the expected answer starts agreeing with you on blurry inputs.
 *
 * Two properties of this class are load-bearing:
 *
 * It has no dependencies it could not be handed in a unit test. The
 * duplicate lookup arrives as a parameter, so a decision is a pure function
 * of an extraction and one boolean.
 *
 * It stops at the first failure and records only that. Collecting every
 * failing rule the way a form does would be wrong here: the user does not
 * fix five fields and resubmit, they upload one new image. The order below
 * is therefore the order of the table in TECH-003 §9 — broadest
 * disqualifier first — so the one reason they read is the most useful one.
 * A photo of a cat that somehow reaches the amount check should say
 * NOT_A_RECEIPT, not "we could not read the amount".
 */
@Component
public class ReceiptRules {

    private static final String EGP = "EGP";

    private final InstapayProperties props;
    private final RecipientMatcher recipientMatcher;

    public ReceiptRules(InstapayProperties props, RecipientMatcher recipientMatcher) {
        this.props = props;
        this.recipientMatcher = recipientMatcher;
    }

    /**
     * Applies the nine rules.
     *
     * @param extraction   what the model read; assumed to have already
     *                     passed ReceiptExtractionValidator, because a
     *                     malformed response is a retryable failure and
     *                     never a rejection the user reads
     * @param creditedCheck whether a reference has already been credited
     * @return CREDIT with the transfer amount, or REJECT with one reason.
     *         Never FAILED — that outcome belongs to a call that never got
     *         an answer, which is decided long before this method.
     */
    public ReceiptDecision decide(ReceiptExtraction extraction, CreditedReferenceCheck creditedCheck) {
        if (extraction == null) {
            return ReceiptDecision.reject(NOTHING_READABLE);
        }

        // 1 · Is it a transfer confirmation at all?
        //
        // Null fails. The schema makes isTransferReceipt the one required
        // field, so a null here means the model did not answer the single
        // question it was obliged to answer.
        if (!Boolean.TRUE.equals(extraction.isTransferReceipt())) {
            return ReceiptDecision.reject(NOT_A_RECEIPT);
        }

        // 2 · Does it say the transfer succeeded?
        //
        // Null fails, and that is the correct reading of "shows as declined,
        // pending or anything other than successful". A screen that does not
        // say it succeeded has not said it succeeded. The user is told to
        // upload again once their bank confirms it, and — because a
        // reference is reserved on credit and not on read — the same
        // reference is still free an hour later.
        if (!Boolean.TRUE.equals(extraction.isSuccessful())) {
            return ReceiptDecision.reject(TRANSFER_NOT_SUCCESSFUL);
        }

        // 3 · Was anything at all read?
        if (!anythingReadable(extraction)) {
            return ReceiptDecision.reject(NOTHING_READABLE);
        }

        // 4 · Is the reference in the picture?
        //
        // This is the common real rejection, and the one the prompt works
        // hardest to make honest: a collapsed "More Details" section leaves
        // the reference genuinely absent, and a null arriving here intact
        // is the system working. A non-null reference for fixture B would
        // mean the model invented one.
        String reference = trimToNull(extraction.referenceNumber());
        if (reference == null) {
            return ReceiptDecision.reject(REFERENCE_NOT_VISIBLE);
        }

        // 5 · Has that reference already been credited?
        //
        // Once in total, not once per user — this is what stops one
        // screenshot becoming two credits, whether the same person uploads
        // it twice or two people share one image.
        if (creditedCheck.alreadyCredited(reference)) {
            return ReceiptDecision.reject(DUPLICATE_REFERENCE);
        }

        // 6 · Is the recipient phone number Orbit's?
        if (!recipientMatcher.phoneMatches(extraction.recipientPhone())) {
            return ReceiptDecision.reject(WRONG_RECIPIENT);
        }

        // 7 · Does the visible part of the recipient name agree?
        if (!recipientMatcher.nameMatches(extraction.recipientNameMasked())) {
            return ReceiptDecision.reject(WRONG_RECIPIENT);
        }

        // 8 · Is the amount something Orbit can credit?
        Optional<Long> amountCents = creditableAmountCents(extraction);
        if (amountCents.isEmpty()) {
            return ReceiptDecision.reject(INVALID_AMOUNT);
        }

        // 9 · Credit the transfer amount. Never the total: the total is what
        // the sender paid their bank, and only the transfer amount arrived.
        return ReceiptDecision.credit(amountCents.get());
    }

    /**
     * Rule 8, which is four checks wearing one code.
     *
     * The currency is EGP, the amount parses, the amount agrees with what
     * was literally printed, and it falls inside InstaPay's own
     * per-transaction limits. Those limits are InstaPay's rather than
     * Orbit's — Orbit cannot accept what InstaPay would not have carried —
     * which is why they are configured separately from the Paymob route's
     * EGP 50 to 20,000 and must never be shared with it.
     */
    private Optional<Long> creditableAmountCents(ReceiptExtraction extraction) {
        String currency = trimToNull(extraction.currency());
        if (currency == null || !EGP.equalsIgnoreCase(currency)) {
            // A null currency fails. That is strict, and it is the strict
            // reading of "currency is EGP" in the table — worth confirming
            // with Mohamed, since a receipt whose currency the model did not
            // read is otherwise perfectly good money.
            return Optional.empty();
        }

        Optional<Long> parsed = ReceiptAmounts.parseCents(extraction.amount());
        if (parsed.isEmpty()) {
            return Optional.empty();
        }
        long cents = parsed.get();

        // The cross-check the second amount field exists for. amountAsShown
        // is the literal pixels and amount is the normalisation of them; if
        // re-parsing the two disagrees, something went wrong in between.
        // An amountAsShown that yields no number at all is not a
        // disagreement — see ReceiptAmounts.
        Optional<Long> asShown = ReceiptAmounts.parseAsShownCents(extraction.amountAsShown());
        if (asShown.isPresent() && asShown.get() != cents) {
            return Optional.empty();
        }

        if (cents < minCents() || cents > maxCents()) {
            return Optional.empty();
        }

        return Optional.of(cents);
    }

    /**
     * Rule 3: did the model read anything beyond "yes, a successful
     * receipt"?
     *
     * In practice a genuinely unreadable image is caught at rule 1, because
     * the model sets isTransferReceipt false for anything that is not a
     * completed transfer confirmation. This rule covers the narrower case
     * where it says yes and then produces nothing to act on.
     */
    private static boolean anythingReadable(ReceiptExtraction extraction) {
        return trimToNull(extraction.amount()) != null
                || trimToNull(extraction.amountAsShown()) != null
                || trimToNull(extraction.currency()) != null
                || trimToNull(extraction.fees()) != null
                || trimToNull(extraction.totalAmount()) != null
                || trimToNull(extraction.referenceNumber()) != null
                || trimToNull(extraction.recipientNameMasked()) != null
                || trimToNull(extraction.recipientPhone()) != null
                || trimToNull(extraction.senderHandle()) != null
                || trimToNull(extraction.senderBank()) != null
                || trimToNull(extraction.transferDateTime()) != null
                || trimToNull(extraction.note()) != null;
    }

    /**
     * The configured limits, through the same converter every other amount
     * in Orbit goes through. A limit that cannot be expressed in cents is a
     * broken configuration and MoneyConverter says so loudly, which is what
     * you want at the first receipt rather than quietly at the millionth.
     */
    private long minCents() {
        return MoneyConverter.majorToCents(props.getMinAmount());
    }

    private long maxCents() {
        return MoneyConverter.majorToCents(props.getMaxAmount());
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
