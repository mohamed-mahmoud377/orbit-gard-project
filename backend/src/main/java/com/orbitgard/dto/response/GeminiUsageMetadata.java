package com.orbitgard.dto.response;


import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.PositiveOrZero;
import lombok.Builder;

/**
 * What the call cost, in tokens. Present on every response, successful or
 * not, and it is the only honest source for the cost columns on the
 * receipt row.
 *
 * Input and output stay separate all the way through. Output tokens cost
 * several times what input tokens do, so a single total cannot be
 * converted back into money, and the ratio is the thing that reveals
 * whether a prompt change got expensive.
 */
@Builder
@JsonIgnoreProperties(ignoreUnknown = true)
public record GeminiUsageMetadata(

        @PositiveOrZero(message = "TOKEN_COUNT_INVALID")
        Integer promptTokenCount,

        @PositiveOrZero(message = "TOKEN_COUNT_INVALID")
        Integer candidatesTokenCount,

        @PositiveOrZero(message = "TOKEN_COUNT_INVALID")
        Integer totalTokenCount
) {

    /** Null-safe: a malformed or absent block must read as zero, not throw. */
    public int inputTokens() {
        return promptTokenCount == null ? 0 : promptTokenCount;
    }

    public int outputTokens() {
        return candidatesTokenCount == null ? 0 : candidatesTokenCount;
    }
}
