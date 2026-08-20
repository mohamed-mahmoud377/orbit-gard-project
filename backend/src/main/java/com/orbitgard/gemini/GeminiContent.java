package com.orbitgard.gemini;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import lombok.Builder;
import lombok.Singular;

import java.util.List;

/**
 * A message and its parts.
 *
 * Part ORDER is significant and the builder preserves it: for a
 * single-image prompt Google's guidance is image first, then the text
 * instruction. Free to get right, and measurably better than the reverse.
 */
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonIgnoreProperties(ignoreUnknown = true)
public record GeminiContent(

        String role,

        @NotEmpty(message = "FIELD_REQUIRED")
        @Valid
        @Singular("part")
        List<GeminiPart> parts
) {

    public static GeminiContent userMessage(GeminiPart... parts) {
        return GeminiContent.builder().role("user").parts(List.of(parts)).build();
    }
}
