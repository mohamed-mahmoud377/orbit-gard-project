package com.orbitgard.instapay;

import com.orbitgard.enums.InstapayRejectionReason;
import com.orbitgard.receipt.ReceiptExtraction;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The decision table, exercised directly.
 *
 * No Spring context, no database, no mocking framework and no API call —
 * the rules are a pure function of an extraction plus one boolean, and this
 * is what that buys. The duplicate lookup arrives as a lambda.
 *
 * Two things are being tested here, and the second matters as much as the
 * first: that each rule fires, and that they fire in the right ORDER. A
 * receipt failing four rules must report the broadest one, because that is
 * the sentence the user reads and "we could not read the amount" is a
 * terrible thing to tell someone who uploaded a photo of a cat.
 */
class ReceiptRulesTest {

    private static final CreditedReferenceCheck NEVER_CREDITED = ref -> false;
    private static final CreditedReferenceCheck ALREADY_CREDITED = ref -> true;

    private ReceiptRules rules;

    @BeforeEach
    void setUp() {
        // The real defaults: Orbit's account name and number as ORB-013
        // states them. Nothing is stubbed.
        InstapayProperties props = new InstapayProperties();
        rules = new ReceiptRules(props, new RecipientMatcher(props));
    }

    /** A receipt that passes every rule. Each test spoils exactly one thing. */
    private static ReceiptExtraction.ReceiptExtractionBuilder valid() {
        return ReceiptExtraction.builder()
                .isTransferReceipt(true)
                .isSuccessful(true)
                .amount("1.00")
                .amountAsShown("1 EGP")
                .currency("EGP")
                .referenceNumber("461669173693")
                .recipientNameMasked("MOHAMED M****** S*** I*****")
                .recipientPhone("01111545710")
                .senderHandle("jerryscb@instapay")
                .senderBank("Suez Canal Bank")
                .transferDateTime("2026-08-17T19:47:00")
                .note("Living Expenses");
    }

    private ReceiptDecision decide(ReceiptExtraction extraction) {
        return rules.decide(extraction, NEVER_CREDITED);
    }

    // =========================================================================
    // The happy path
    // =========================================================================

    @Test
    @DisplayName("a receipt that passes every rule credits the transfer amount")
    void validReceiptIsCredited() {
        ReceiptDecision decision = decide(valid().build());

        assertThat(decision.credited()).isTrue();
        assertThat(decision.creditCents()).isEqualTo(100L);
        assertThat(decision.rejectionReason()).isNull();
    }

    @Test
    @DisplayName("the transfer amount is credited, never the total")
    void feesAreNeverCredited() {
        // Transfer 1.00, Fees 0.50, Total 1.50. The total is what the sender
        // paid their bank; only 1.00 arrived. Crediting 1.50 is giving money
        // away, on every single receipt that carries a fee.
        ReceiptDecision decision = decide(valid()
                .fees("0.50")
                .totalAmount("1.50")
                .build());

        assertThat(decision.creditCents()).isEqualTo(100L);
    }

    // =========================================================================
    // Rules 1-3
    // =========================================================================

    @Nested
    @DisplayName("rules 1-3: is this a receipt worth reading")
    class BroadDisqualifiers {

        @Test
        @DisplayName("1: anything that is not a transfer confirmation")
        void notAReceipt() {
            assertRejected(decide(valid().isTransferReceipt(false).build()),
                    InstapayRejectionReason.NOT_A_RECEIPT);
        }

        @Test
        @DisplayName("1: a null isTransferReceipt is a failure, not a pass")
        void nullIsTransferReceipt() {
            // It is the one required field in the schema. Null means the
            // model did not answer the only question it had to answer, so
            // treating it as anything but a failure would be reading
            // silence as consent.
            assertRejected(decide(valid().isTransferReceipt(null).build()),
                    InstapayRejectionReason.NOT_A_RECEIPT);
        }

        @Test
        @DisplayName("2: a transfer that does not show as successful")
        void notSuccessful() {
            assertRejected(decide(valid().isSuccessful(false).build()),
                    InstapayRejectionReason.TRANSFER_NOT_SUCCESSFUL);
        }

        @Test
        @DisplayName("2: a null isSuccessful is a failure — silence is not success")
        void nullIsSuccessful() {
            // This is the screenshot-taken-while-the-bank-still-says-pending
            // case. It is rejected now and the same reference is still free
            // an hour later, because a reference is reserved on credit and
            // not on read.
            assertRejected(decide(valid().isSuccessful(null).build()),
                    InstapayRejectionReason.TRANSFER_NOT_SUCCESSFUL);
        }

        @Test
        @DisplayName("3: a receipt the model claims is fine but read nothing from")
        void nothingReadable() {
            ReceiptExtraction empty = ReceiptExtraction.builder()
                    .isTransferReceipt(true)
                    .isSuccessful(true)
                    .build();

            assertRejected(decide(empty), InstapayRejectionReason.NOTHING_READABLE);
        }

        @Test
        @DisplayName("3: one readable field anywhere is enough to get past")
        void oneFieldIsEnough() {
            ReceiptExtraction almostEmpty = ReceiptExtraction.builder()
                    .isTransferReceipt(true)
                    .isSuccessful(true)
                    .senderBank("Suez Canal Bank")
                    .build();

            // Past rule 3 and straight into rule 4 — which is the point.
            assertRejected(decide(almostEmpty), InstapayRejectionReason.REFERENCE_NOT_VISIBLE);
        }
    }

    // =========================================================================
    // Rules 4-5: the reference
    // =========================================================================

    @Nested
    @DisplayName("rules 4-5: the reference number")
    class Reference {

        @Test
        @DisplayName("4: a collapsed More Details section is REFERENCE_NOT_VISIBLE")
        void referenceMissing() {
            // The common real rejection. The image is perfectly legible, the
            // transfer is real, the money arrived — and the reference is
            // simply not in the picture.
            assertRejected(decide(valid().referenceNumber(null).build()),
                    InstapayRejectionReason.REFERENCE_NOT_VISIBLE);
        }

        @Test
        @DisplayName("4: whitespace is not a reference number")
        void blankReference() {
            assertRejected(decide(valid().referenceNumber("   ").build()),
                    InstapayRejectionReason.REFERENCE_NOT_VISIBLE);
        }

        @Test
        @DisplayName("5: a reference that has already been credited")
        void duplicateReference() {
            // One reference, one credit, ever — not once per user. This is
            // what stops one screenshot becoming two credits when two people
            // share the same image.
            ReceiptDecision decision = rules.decide(valid().build(), ALREADY_CREDITED);

            assertRejected(decision, InstapayRejectionReason.DUPLICATE_REFERENCE);
        }

        @Test
        @DisplayName("5: the exact reference read off the image is what gets looked up")
        void referenceIsPassedToTheLookupVerbatim() {
            StringBuilder seen = new StringBuilder();

            rules.decide(valid().referenceNumber("208665771080").build(), ref -> {
                seen.append(ref);
                return false;
            });

            assertThat(seen.toString()).isEqualTo("208665771080");
        }
    }

    // =========================================================================
    // Rules 6-7: the recipient
    // =========================================================================

    @Nested
    @DisplayName("rules 6-7: was this sent to Orbit")
    class Recipient {

        @Test
        @DisplayName("6: a transfer to somebody else's number")
        void wrongPhone() {
            assertRejected(decide(valid().recipientPhone("01234567890").build()),
                    InstapayRejectionReason.WRONG_RECIPIENT);
        }

        @Test
        @DisplayName("6: a missing phone number is a miss, not a pass")
        void missingPhone() {
            assertRejected(decide(valid().recipientPhone(null).build()),
                    InstapayRejectionReason.WRONG_RECIPIENT);
        }

        @Test
        @DisplayName("6: the same number written internationally still matches")
        void internationalPhoneFormat() {
            assertThat(decide(valid().recipientPhone("+201111545710").build()).credited()).isTrue();
            assertThat(decide(valid().recipientPhone("00201111545710").build()).credited()).isTrue();
        }

        @Test
        @DisplayName("7: a masked name whose first token is somebody else")
        void wrongName() {
            assertRejected(decide(valid().recipientNameMasked("AHMED A**** S***").build()),
                    InstapayRejectionReason.WRONG_RECIPIENT);
        }

        @Test
        @DisplayName("7: a missing name is a miss")
        void missingName() {
            assertRejected(decide(valid().recipientNameMasked(null).build()),
                    InstapayRejectionReason.WRONG_RECIPIENT);
        }

        @Test
        @DisplayName("7: the mask is honoured — a partly masked first name still matches")
        void partiallyMaskedFirstName() {
            // Some apps mask harder than others. One real letter is weaker
            // evidence, not no evidence, and the phone number is what
            // actually decided this transfer. Anything stricter here rejects
            // real money with no reviewer to appeal to.
            assertThat(decide(valid().recipientNameMasked("M****** M***** S***").build()).credited())
                    .isTrue();
        }

        @Test
        @DisplayName("7: a name that is nothing but asterisks carries no information")
        void fullyMaskedName() {
            assertRejected(decide(valid().recipientNameMasked("****** ***").build()),
                    InstapayRejectionReason.WRONG_RECIPIENT);
        }

        @Test
        @DisplayName("7: an exact equals() against the configured name is never required")
        void extraNamePartsAreFine() {
            // The configured name has three parts and real receipts print
            // four. equals() would fail on every genuine receipt Orbit will
            // ever see.
            assertThat(decide(valid().recipientNameMasked("mohamed m****** s*** i*****").build()).credited())
                    .isTrue();
        }
    }

    // =========================================================================
    // Rule 8
    // =========================================================================

    @Nested
    @DisplayName("rule 8: is the amount creditable")
    class Amount {

        @Test
        @DisplayName("a currency that is not EGP")
        void wrongCurrency() {
            assertRejected(decide(valid().currency("USD").build()),
                    InstapayRejectionReason.INVALID_AMOUNT);
        }

        @Test
        @DisplayName("an amount that does not parse")
        void unparseableAmount() {
            assertRejected(decide(valid().amount("one pound").build()),
                    InstapayRejectionReason.INVALID_AMOUNT);
        }

        @Test
        @DisplayName("both InstaPay limits are inclusive")
        void limitsAreInclusive() {
            assertThat(decide(valid().amount("0.01").amountAsShown("0.01 EGP").build()).creditCents())
                    .isEqualTo(1L);
            assertThat(decide(valid().amount("70000.00").amountAsShown("70000.00 EGP").build()).creditCents())
                    .isEqualTo(7_000_000L);
        }

        @Test
        @DisplayName("an amount outside the InstaPay limits")
        void outsideLimits() {
            assertRejected(decide(valid().amount("0.00").amountAsShown("0 EGP").build()),
                    InstapayRejectionReason.INVALID_AMOUNT);
            assertRejected(decide(valid().amount("70000.01").amountAsShown("70000.01 EGP").build()),
                    InstapayRejectionReason.INVALID_AMOUNT);
        }

        @Test
        @DisplayName("the normalised amount must agree with what was printed")
        void crossCheckCatchesDisagreement() {
            // The reason two amount fields is not redundant. Fifteen output
            // tokens for a check that costs nothing to run.
            assertRejected(decide(valid().amount("1.00").amountAsShown("1.50 EGP").build()),
                    InstapayRejectionReason.INVALID_AMOUNT);
        }

        @Test
        @DisplayName("an amountAsShown with no number in it is no opinion, not a disagreement")
        void crossCheckIsLenient() {
            // Rejecting real money because a bank formatted its currency
            // symbol unexpectedly would be a worse failure than skipping a
            // check the phone number already backstops.
            assertThat(decide(valid().amountAsShown("EGP").build()).credited()).isTrue();
        }

        @Test
        @DisplayName("Arabic-Indic digits in amountAsShown still cross-check")
        void arabicIndicCrossCheck() {
            // Egyptian bank apps render in Arabic often enough that this
            // happens in the first week of real use.
            assertThat(decide(valid().amountAsShown("\u0661 \u062C.\u0645").build()).credited()).isTrue();
            assertThat(decide(valid()
                    .amount("1500.00")
                    .amountAsShown("\u0661\u0665\u0660\u0660\u066B\u0660\u0660 \u062C.\u0645")
                    .build()).creditCents()).isEqualTo(150_000L);
        }
    }

    // =========================================================================
    // Order
    // =========================================================================

    @Nested
    @DisplayName("the order of the rules")
    class Order {

        @Test
        @DisplayName("the broadest failure is the one reported")
        void broadestFirst() {
            // Fails rules 1, 2, 4, 6, 7 and 8 simultaneously. The user is
            // told the useful thing.
            ReceiptExtraction nonsense = ReceiptExtraction.builder()
                    .isTransferReceipt(false)
                    .amount("nope")
                    .build();

            assertRejected(decide(nonsense), InstapayRejectionReason.NOT_A_RECEIPT);
        }

        @Test
        @DisplayName("a duplicate is caught before the recipient is even looked at")
        void duplicateBeatsRecipient() {
            ReceiptDecision decision = rules.decide(
                    valid().recipientPhone("01234567890").build(), ALREADY_CREDITED);

            assertRejected(decision, InstapayRejectionReason.DUPLICATE_REFERENCE);
        }

        @Test
        @DisplayName("a missing reference is caught before the amount is parsed")
        void referenceBeatsAmount() {
            assertRejected(decide(valid().referenceNumber(null).amount("nonsense").build()),
                    InstapayRejectionReason.REFERENCE_NOT_VISIBLE);
        }

        @Test
        @DisplayName("only the first failure is reported, never a list")
        void oneReasonOnly() {
            // Unlike a form, where someone fixes five fields at once, here
            // the user uploads a new image. A list would be noise.
            ReceiptDecision decision = decide(valid()
                    .recipientPhone(null)
                    .currency("USD")
                    .build());

            assertThat(decision.rejectionReason()).isEqualTo(InstapayRejectionReason.WRONG_RECIPIENT);
            assertThat(decision.creditCents()).isNull();
        }
    }

    // =========================================================================

    @Test
    @DisplayName("a null extraction never reaches the rules, but does not blow up if it does")
    void nullExtraction() {
        assertRejected(rules.decide(null, NEVER_CREDITED), InstapayRejectionReason.NOTHING_READABLE);
    }

    private static void assertRejected(ReceiptDecision decision, InstapayRejectionReason expected) {
        assertThat(decision.credited()).isFalse();
        assertThat(decision.rejectionReason()).isEqualTo(expected);
        assertThat(decision.creditCents()).isNull();
    }
}
