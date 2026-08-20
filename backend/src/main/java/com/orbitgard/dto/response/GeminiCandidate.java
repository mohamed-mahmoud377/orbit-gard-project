package com.orbitgard.dto.response;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.orbitgard.gemini.GeminiContent;
import lombok.Builder;

/**
 * One answer.
 *
 * finishReason has to be checked BEFORE the payload is parsed. Anything
 * other than STOP — MAX_TOKENS above all — means the JSON inside is cut
 * off, and parsing it throws something that points nowhere near the real
 * cause.
 */
@Builder
@JsonIgnoreProperties(ignoreUnknown = true)
public record GeminiCandidate(

        GeminiContent content,

        String finishReason
) {

    private static final String FINISH_REASON_STOP = "STOP";

    public boolean completedNormally() {
        return FINISH_REASON_STOP.equals(finishReason);
    }
}
