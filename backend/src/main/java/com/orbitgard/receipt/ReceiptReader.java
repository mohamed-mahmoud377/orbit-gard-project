package com.orbitgard.receipt;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orbitgard.dto.request.GeminiGenerateContentRequest;
import com.orbitgard.dto.response.GeminiCandidate;
import com.orbitgard.dto.response.GeminiGenerateContentResponse;
import com.orbitgard.dto.response.GeminiUsageMetadata;
import com.orbitgard.enums.ReceiptReadFailure;
import com.orbitgard.gemini.GeminiCallException;
import com.orbitgard.gemini.GeminiClient;
import com.orbitgard.gemini.GeminiProperties;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.Duration;
import java.util.Base64;
import java.util.Optional;

/**
 * Turns a receipt image into fields. Reads, never decides.
 *
 * Nothing in this class compares a value against Orbit's account, the amount
 * limits, or anything else. Whether an extraction is acceptable is the
 * rules' job; a failure here always means "no answer was obtained", never
 * "the answer was unwelcome". That distinction is what keeps FAILED
 * (retryable) apart from REJECTED (terminal).
 *
 * Token counts are recorded on every path that reached the model, including
 * the ones that end in failure. A malformed response still cost a call, and
 * a row whose retries are not counted looks cheaper than it was.
 */
@Component
@Slf4j
public class ReceiptReader {

    private static final BigDecimal TEMPERATURE_TRANSCRIBE = BigDecimal.ZERO;
    private static final String JSON_MIME_TYPE = "application/json";

    private final GeminiClient geminiClient;
    private final GeminiProperties props;
    private final ReceiptImageDownscaler downscaler;
    private final ReceiptExtractionValidator validator;
    private final ObjectMapper objectMapper;

    public ReceiptReader(GeminiClient geminiClient,
                         GeminiProperties props,
                         ReceiptImageDownscaler downscaler,
                         ReceiptExtractionValidator validator,
                         ObjectMapper objectMapper) {
        this.geminiClient = geminiClient;
        this.props = props;
        this.downscaler = downscaler;
        this.validator = validator;
        this.objectMapper = objectMapper;
    }

    /** Reads one receipt. Never throws for a bad answer — see ReceiptReadResult. */
    public ReceiptReadResult read(byte[] imageBytes) {
        byte[] jpeg;
        try {
            jpeg = downscaler.downscaleToJpeg(imageBytes);
        } catch (IOException e) {
            // Not an image at all. No call was made, so nothing was spent.
            log.warn("Receipt image could not be decoded: {}", e.getMessage());
            return failed(ReceiptReadFailure.MALFORMED_EXTRACTION,
                    GeminiUsageMetadata.builder().build(), Duration.ZERO);
        }

        GeminiGenerateContentRequest request = buildRequest(jpeg);

        long startedAt = System.nanoTime();
        GeminiGenerateContentResponse response;
        try {
            response = geminiClient.generateContent(request);
        } catch (GeminiCallException e) {
            Duration elapsed = elapsedSince(startedAt);
            ReceiptReadFailure failure = e.getKind() == GeminiCallException.Kind.RATE_LIMITED
                    ? ReceiptReadFailure.RATE_LIMITED
                    : ReceiptReadFailure.TRANSPORT_ERROR;
            log.warn("Gemini call failed after {} ms: {}", elapsed.toMillis(), failure);
            return failed(failure, GeminiUsageMetadata.builder().build(), elapsed);
        }

        return interpret(response, elapsedSince(startedAt));
    }

    /**
     * Turns an envelope into a result. Separated from the HTTP call so the
     * fixture receipts can drive the whole interpretation path offline, with
     * no API call and nothing to pay for.
     */
    public ReceiptReadResult interpret(GeminiGenerateContentResponse response, Duration callDuration) {
        GeminiUsageMetadata usage = response.usageOrEmpty();

        // finishReason is checked BEFORE the payload is touched. MAX_TOKENS
        // means the JSON inside is cut off, and parsing it throws something
        // that points nowhere near the real cause.
        Optional<GeminiCandidate> candidate = response.firstCandidate();
        if (candidate.isEmpty()) {
            log.warn("Gemini returned no candidates");
            return failed(ReceiptReadFailure.EMPTY_RESPONSE, usage, callDuration);
        }
        if (!candidate.get().completedNormally()) {
            log.warn("Gemini finished abnormally: finishReason={}", candidate.get().finishReason());
            return failed(ReceiptReadFailure.INCOMPLETE_RESPONSE, usage, callDuration);
        }

        Optional<String> payload = response.firstText();
        if (payload.isEmpty()) {
            log.warn("Gemini response carried no text part to parse");
            return failed(ReceiptReadFailure.EMPTY_RESPONSE, usage, callDuration);
        }

        // The second pass. The fields are not at the top level of the
        // envelope — they arrive as a JSON string inside
        // candidates[0].content.parts[0].text.
        ReceiptExtraction extraction;
        try {
            extraction = objectMapper.readValue(payload.get(), ReceiptExtraction.class);
        } catch (JsonProcessingException e) {
            // The payload itself is never logged: it holds the sender's
            // bank, their handle and their masked name.
            log.warn("Gemini payload was not valid JSON: {}", e.getOriginalMessage());
            return failed(ReceiptReadFailure.MALFORMED_EXTRACTION, usage, callDuration);
        }

        String violations = validator.violationSummary(extraction);
        if (violations != null) {
            // Field names and constraint codes only — never values.
            log.warn("Gemini extraction failed shape validation: {}", violations);
            return failed(ReceiptReadFailure.MALFORMED_EXTRACTION, usage, callDuration);
        }

        return ReceiptReadResult.builder()
                .extraction(extraction)
                .model(props.getModel())
                .inputTokens(usage.inputTokens())
                .outputTokens(usage.outputTokens())
                .callDuration(callDuration)
                .build();
    }

    private GeminiGenerateContentRequest buildRequest(byte[] jpeg) {
        String base64 = Base64.getEncoder().encodeToString(jpeg);

        return GeminiGenerateContentRequest.builder()
                .systemInstruction(GeminiSystemInstruction.of(ReceiptPrompt.SYSTEM_INSTRUCTION))
                .content(GeminiContent.userMessage(
                        // Image first, then the text. Google's guidance for
                        // single-image prompts, and free to get right.
                        GeminiPart.image(downscaler.mimeType(), base64),
                        GeminiPart.text(ReceiptPrompt.USER_INSTRUCTION)))
                .generationConfig(GeminiGenerationConfig.builder()
                        // Transcribing, not writing. Nothing to be creative about.
                        .temperature(TEMPERATURE_TRANSCRIBE)
                        .maxOutputTokens(props.getMaxOutputTokens())
                        .responseMimeType(JSON_MIME_TYPE)
                        .responseSchema(ReceiptPrompt.extractionSchema())
                        .build())
                .build();
    }

    private ReceiptReadResult failed(ReceiptReadFailure failure,
                                     GeminiUsageMetadata usage,
                                     Duration callDuration) {
        return ReceiptReadResult.builder()
                .failure(failure)
                .model(props.getModel())
                .inputTokens(usage.inputTokens())
                .outputTokens(usage.outputTokens())
                .callDuration(callDuration)
                .build();
    }

    private Duration elapsedSince(long startedAtNanos) {
        return Duration.ofNanos(System.nanoTime() - startedAtNanos);
    }
}
