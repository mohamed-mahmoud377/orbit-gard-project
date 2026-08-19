package com.orbitgard.dto.response;


import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.orbitgard.gemini.GeminiContent;
import com.orbitgard.gemini.GeminiPart;
import lombok.Builder;

import java.util.List;
import java.util.Optional;

/**
 * The envelope, and the trap.
 *
 * The fields you actually want are NOT at this level. They arrive as a
 * JSON string inside candidates[0].content.parts[0].text, so reading a
 * response is two Jackson passes: this record first, then the extracted
 * string parsed into ReceiptExtraction. Expecting one pass is the single
 * most common way to lose an hour here.
 *
 * firstText() exists so that navigation happens once, in a null-safe
 * place, instead of as a chain of dereferences at the call site.
 */
@Builder
@JsonIgnoreProperties(ignoreUnknown = true)
public record GeminiGenerateContentResponse(

        List<GeminiCandidate> candidates,

        GeminiUsageMetadata usageMetadata
) {

    public Optional<GeminiCandidate> firstCandidate() {
        return candidates == null || candidates.isEmpty()
                ? Optional.empty()
                : Optional.ofNullable(candidates.getFirst());
    }

    /**
     * The JSON payload as a raw string, or empty if the response is not
     * shaped as expected. Empty is a failed read, never a null extraction.
     */
    public Optional<String> firstText() {
        return firstCandidate()
                .map(GeminiCandidate::content)
                .map(GeminiContent::parts)
                .filter(parts -> !parts.isEmpty())
                .map(List::getFirst)
                .map(GeminiPart::text)
                .filter(text -> !text.isBlank());
    }

    /** Never null, so token accounting works even on a malformed response. */
    public GeminiUsageMetadata usageOrEmpty() {
        return usageMetadata == null ? GeminiUsageMetadata.builder().build() : usageMetadata;
    }
}
