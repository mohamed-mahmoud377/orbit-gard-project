package com.orbitgard.instapay;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orbitgard.dto.response.GeminiGenerateContentResponse;
import com.orbitgard.enums.InstapayRejectionReason;
import com.orbitgard.gemini.GeminiClient;
import com.orbitgard.gemini.GeminiProperties;
import com.orbitgard.receipt.ReceiptExtraction;
import com.orbitgard.receipt.ReceiptExtractionValidator;
import com.orbitgard.receipt.ReceiptImageDownscaler;
import com.orbitgard.receipt.ReceiptReadResult;
import com.orbitgard.receipt.ReceiptReader;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * The three real receipts, all the way from a stored Gemini envelope to a
 * credit-or-reject decision.
 *
 * ReceiptReaderFixtureTest already proves the reading half. This proves the
 * two halves agree: it parses the same envelopes, hands the extraction to
 * the rules, and asserts the outcomes TECH-003 §7 documents for each one.
 * Wiring them together is where the interesting mistake lives — a prompt
 * change that quietly starts returning "1.50" in `amount` passes every
 * reading test and silently overpays every user.
 *
 * Offline, as always. No API call is made and nothing is spent.
 */
class ReceiptRulesFixtureTest {

    private static final CreditedReferenceCheck NEVER_CREDITED = ref -> false;
    private static final CreditedReferenceCheck ALREADY_CREDITED = ref -> true;

    private static ObjectMapper objectMapper;
    private static ReceiptReader reader;
    private static ReceiptRules rules;

    @BeforeAll
    static void setUp() {
        objectMapper = new ObjectMapper();

        ValidatorFactory factory = Validation.buildDefaultValidatorFactory();
        Validator validator = factory.getValidator();

        // The client and the downscaler are never touched: every case goes
        // through interpret(), which takes an envelope already in hand.
        reader = new ReceiptReader(
                mock(GeminiClient.class),
                new GeminiProperties(),
                mock(ReceiptImageDownscaler.class),
                new ReceiptExtractionValidator(validator),
                objectMapper);

        InstapayProperties props = new InstapayProperties();
        rules = new ReceiptRules(props, new RecipientMatcher(props));
    }

    private static ReceiptExtraction extractionFrom(String fixtureName) throws IOException {
        try (InputStream in = ReceiptRulesFixtureTest.class
                .getResourceAsStream("/fixtures/receipts/" + fixtureName)) {
            assertThat(in).as("fixture %s is on the classpath", fixtureName).isNotNull();

            GeminiGenerateContentResponse envelope =
                    objectMapper.readValue(in, GeminiGenerateContentResponse.class);

            ReceiptReadResult result = reader.interpret(envelope, Duration.ofMillis(900));
            assertThat(result.successful()).as("fixture %s reads cleanly", fixtureName).isTrue();

            return result.extraction();
        }
    }

    private static ReceiptDecision decide(String fixtureName) throws IOException {
        return rules.decide(extractionFrom(fixtureName), NEVER_CREDITED);
    }

    // =========================================================================

    @Test
    @DisplayName("A: a complete shared receipt credits EGP 1.00")
    void fixtureAIsCredited() throws IOException {
        ReceiptDecision decision = decide("a-shared-receipt-complete.json");

        assertThat(decision.credited()).isTrue();
        assertThat(decision.creditCents()).isEqualTo(100L);
    }

    @Test
    @DisplayName("B: a collapsed More Details section is rejected REFERENCE_NOT_VISIBLE")
    void fixtureBIsRejected() throws IOException {
        // The important one. The image is legible, the transfer is real, the
        // money arrived — and the reference is simply not in the picture. If
        // a prompt change ever makes this fixture produce a reference, the
        // model invented it, and an invented reference passes the uniqueness
        // check and credits a wallet.
        ReceiptDecision decision = decide("b-more-details-collapsed.json");

        assertThat(decision.credited()).isFalse();
        assertThat(decision.rejectionReason())
                .isEqualTo(InstapayRejectionReason.REFERENCE_NOT_VISIBLE);
    }

    @Test
    @DisplayName("C: the expanded screen credits 1.00 and not 1.50")
    void fixtureCCreditsTheTransferNotTheTotal() throws IOException {
        // Transfer 1.00, Fees 0.50, Total 1.50. The total is what the sender
        // paid their bank; only the transfer amount arrived.
        ReceiptDecision decision = decide("c-more-details-expanded.json");

        assertThat(decision.credited()).isTrue();
        assertThat(decision.creditCents()).isEqualTo(100L);
        assertThat(decision.creditCents()).isNotEqualTo(150L);
    }

    @Test
    @DisplayName("A and C carry different references, so both can be credited")
    void fixturesAAndCAreDistinctTransfers() throws IOException {
        String referenceA = extractionFrom("a-shared-receipt-complete.json").referenceNumber();
        String referenceC = extractionFrom("c-more-details-expanded.json").referenceNumber();

        assertThat(referenceA).isNotEqualTo(referenceC);
    }

    @Test
    @DisplayName("a second image of an already credited transfer is DUPLICATE_REFERENCE")
    void alreadyCreditedReferenceIsRefused() throws IOException {
        // Crop one pixel, recompress, and the file hash changes while the
        // transfer underneath is the same. The hash check at upload cannot
        // see that; this rule and the partial unique index behind it can.
        ReceiptDecision decision = rules.decide(
                extractionFrom("a-shared-receipt-complete.json"), ALREADY_CREDITED);

        assertThat(decision.credited()).isFalse();
        assertThat(decision.rejectionReason())
                .isEqualTo(InstapayRejectionReason.DUPLICATE_REFERENCE);
    }
}
