package com.orbitgard.receipt;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orbitgard.dto.response.GeminiGenerateContentResponse;
import com.orbitgard.enums.ReceiptReadFailure;
import com.orbitgard.gemini.GeminiClient;
import com.orbitgard.gemini.GeminiProperties;

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
 * The regression suite for the prompt.
 *
 * Every case here runs offline against a stored envelope. No API call is
 * made and nothing is spent — an intern who wires the live call into
 * `mvn test` and then builds forty times in an afternoon is the most likely
 * way this project ever spends money on Gemini.
 *
 * The fixtures are full envelopes rather than bare extraction objects, so
 * the two-pass parse is exercised: the envelope first, then the JSON string
 * inside candidates[0].content.parts[0].text.
 */
class ReceiptReaderFixtureTest {

    private static ReceiptReader reader;
    private static ObjectMapper objectMapper;

    @BeforeAll
    static void setUp() {
        objectMapper = new ObjectMapper();

        ValidatorFactory factory = Validation.buildDefaultValidatorFactory();
        Validator validator = factory.getValidator();

        GeminiProperties props = new GeminiProperties();

        // The client is never called: every test goes through interpret(),
        // which takes an envelope that is already in hand.
        reader = new ReceiptReader(
                mock(GeminiClient.class),
                props,
                mock(ReceiptImageDownscaler.class),
                new ReceiptExtractionValidator(validator),
                objectMapper);
    }

    private static GeminiGenerateContentResponse fixture(String name) throws IOException {
        try (InputStream in = ReceiptReaderFixtureTest.class
                .getResourceAsStream("/fixtures/receipts/" + name)) {
            assertThat(in).as("fixture %s is on the classpath", name).isNotNull();
            return objectMapper.readValue(in, GeminiGenerateContentResponse.class);
        }
    }

    private static ReceiptReadResult read(String fixtureName) throws IOException {
        return reader.interpret(fixture(fixtureName), Duration.ofMillis(900));
    }

    // =========================================================================
    // Fixture A — shared receipt image, everything present
    // =========================================================================

    @Test
    @DisplayName("A: a complete shared receipt reads every field")
    void fixtureAReadsEveryField() throws IOException {
        ReceiptReadResult result = read("a-shared-receipt-complete.json");

        assertThat(result.successful()).isTrue();
        ReceiptExtraction e = result.extraction();

        assertThat(e.isTransferReceipt()).isTrue();
        assertThat(e.isSuccessful()).isTrue();
        assertThat(e.amount()).isEqualTo("1.00");
        assertThat(e.amountAsShown()).isEqualTo("1 EGP");
        assertThat(e.currency()).isEqualTo("EGP");
        assertThat(e.referenceNumber()).isEqualTo("461669173693");
        assertThat(e.recipientPhone()).isEqualTo("01111545710");
        assertThat(e.transferDateTime()).isEqualTo("2026-08-17T19:47:00");
        assertThat(e.note()).isEqualTo("Living Expenses");
    }

    @Test
    @DisplayName("A: the masked recipient name is copied verbatim, never expanded")
    void fixtureAKeepsTheMaskIntact() throws IOException {
        ReceiptExtraction e = read("a-shared-receipt-complete.json").extraction();

        // Asking for a name tempts a model into unmasking it, inventing
        // letters that were never on screen.
        assertThat(e.recipientNameMasked()).isEqualTo("MOHAMED M****** S*** I*****");
        assertThat(e.recipientNameMasked()).contains("*");
    }

    // =========================================================================
    // Fixture B — the important one
    // =========================================================================

    @Test
    @DisplayName("B: a collapsed More Details section yields a null reference, not a guess")
    void fixtureBReturnsNullReference() throws IOException {
        ReceiptReadResult result = read("b-more-details-collapsed.json");

        assertThat(result.successful()).isTrue();
        ReceiptExtraction e = result.extraction();

        // The image is perfectly legible, the transfer is real, the money
        // arrived — and the reference is simply not in the picture. If this
        // ever comes back non-null, the prompt is broken and an invented
        // number is one uniqueness check away from crediting a wallet.
        assertThat(e.referenceNumber())
                .as("a hallucinated reference would pass the uniqueness check and credit a wallet")
                .isNull();

        assertThat(e.transferDateTime()).isNull();
        assertThat(e.note()).isNull();

        // Null is a valid answer, not a malformed response. It has to reach
        // the rules intact so it can become REFERENCE_NOT_VISIBLE.
        assertThat(result.failure()).isNull();
    }

    @Test
    @DisplayName("B: everything that WAS visible still came through")
    void fixtureBStillReadsTheVisibleFields() throws IOException {
        ReceiptExtraction e = read("b-more-details-collapsed.json").extraction();

        assertThat(e.amount()).isEqualTo("1.00");
        assertThat(e.recipientPhone()).isEqualTo("01111545710");
        assertThat(e.isSuccessful()).isTrue();
    }

    // =========================================================================
    // Fixture C — fees present
    // =========================================================================

    @Test
    @DisplayName("C: the transfer amount and the total stay separate")
    void fixtureCKeepsAmountAndTotalApart() throws IOException {
        ReceiptExtraction e = read("c-more-details-expanded.json").extraction();

        // 1.50 is what the sender paid their bank. Only 1.00 arrived.
        // Crediting the total would be giving money away.
        assertThat(e.amount()).isEqualTo("1.00");
        assertThat(e.fees()).isEqualTo("0.50");
        assertThat(e.totalAmount()).isEqualTo("1.50");
        assertThat(e.amount()).isNotEqualTo(e.totalAmount());
    }

    @Test
    @DisplayName("C: expanding More Details reveals the reference")
    void fixtureCHasAReference() throws IOException {
        assertThat(read("c-more-details-expanded.json").extraction().referenceNumber())
                .isEqualTo("208665771080");
    }

    // =========================================================================
    // Token accounting
    // =========================================================================

    @Test
    @DisplayName("Input and output tokens are recorded separately on every fixture")
    void tokensAreRecorded() throws IOException {
        ReceiptReadResult a = read("a-shared-receipt-complete.json");

        assertThat(a.inputTokens()).isEqualTo(1487);
        assertThat(a.outputTokens()).isEqualTo(142);
        assertThat(a.model()).isEqualTo("gemini-3.1-flash-lite");

        // Output tokens cost several times what input tokens do, so a single
        // total cannot be converted back into money.
        assertThat(a.inputTokens()).isNotEqualTo(a.outputTokens());
    }

    // =========================================================================
    // Envelope-level failures
    // =========================================================================

    @Test
    @DisplayName("A truncated response is a failed read, never parsed")
    void truncatedResponseIsNotParsed() throws IOException {
        ReceiptReadResult result = read("x-truncated-max-tokens.json");

        // finishReason is checked before the payload is touched. Parsing
        // truncated JSON throws something that points nowhere near the cause.
        assertThat(result.successful()).isFalse();
        assertThat(result.failure()).isEqualTo(ReceiptReadFailure.INCOMPLETE_RESPONSE);
        assertThat(result.extraction()).isNull();
    }

    @Test
    @DisplayName("A failed read still records what it cost")
    void failedReadStillRecordsTokens() throws IOException {
        ReceiptReadResult result = read("x-truncated-max-tokens.json");

        // The call happened. Not recording it makes the most expensive rows
        // in the table look like the cheapest.
        assertThat(result.inputTokens()).isGreaterThan(0);
        assertThat(result.outputTokens()).isGreaterThan(0);
    }

    @Test
    @DisplayName("An empty candidate list is a failed read, not a crash")
    void noCandidatesIsAFailedRead() throws IOException {
        ReceiptReadResult result = read("x-no-candidates.json");

        assertThat(result.failure()).isEqualTo(ReceiptReadFailure.EMPTY_RESPONSE);
        assertThat(result.inputTokens()).isEqualTo(1400);
    }

    // =========================================================================
    // Shape validation
    // =========================================================================

    @Test
    @DisplayName("A hallucinated non-numeric phone is rejected as malformed, not passed on")
    void malformedFieldFailsValidation() {
        ReceiptExtraction bad = ReceiptExtraction.builder()
                .isTransferReceipt(true)
                .recipientPhone("call me maybe")
                .build();

        ReceiptExtractionValidator v = new ReceiptExtractionValidator(
                Validation.buildDefaultValidatorFactory().getValidator());

        assertThat(v.isWellFormed(bad)).isFalse();
        assertThat(v.violationSummary(bad)).contains("recipientPhone");
    }

    @Test
    @DisplayName("Nulls everywhere are well formed — absence is a valid answer")
    void allNullsIsWellFormed() {
        ReceiptExtraction sparse = ReceiptExtraction.builder()
                .isTransferReceipt(false)
                .build();

        ReceiptExtractionValidator v = new ReceiptExtractionValidator(
                Validation.buildDefaultValidatorFactory().getValidator());

        assertThat(v.isWellFormed(sparse)).isTrue();
    }
}
