package com.orbitgard.dto.request;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Positive;
import lombok.Builder;

import java.math.BigDecimal;

/**
 * Generation settings.
 *
 * For transcription the values are not a matter of taste: temperature 0
 * because there is nothing to be creative about, and responseSchema paired
 * with responseMimeType "application/json" so the model is forced into a
 * parseable object instead of prose.
 */
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public record GeminiGenerationConfig(

        @DecimalMin(value = "0.0", message = "TEMPERATURE_INVALID")
        @DecimalMax(value = "2.0", message = "TEMPERATURE_INVALID")
        BigDecimal temperature,

        /**
         * Deliberate headroom over the expected payload. Too tight and the
         * JSON is truncated, finishReason comes back MAX_TOKENS, and the
         * parse fails somewhere far from the cause.
         */
        @Positive(message = "MAX_OUTPUT_TOKENS_INVALID")
        Integer maxOutputTokens,

        String responseMimeType,

        @Valid
        GeminiSchema responseSchema
) {
}
