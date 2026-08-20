package com.orbitgard.dto.request;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orbitgard.gemini.GeminiContent;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import lombok.Builder;
import lombok.Singular;

import java.util.List;

/** The body of POST /v1beta/models/{model}:generateContent. */
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public record GeminiGenerateContentRequest(

        @Valid
        GeminiSystemInstruction systemInstruction,

        @NotEmpty(message = "FIELD_REQUIRED")
        @Valid
        @Singular("content")
        List<GeminiContent> contents,

        @Valid
        GeminiGenerationConfig generationConfig
) {
}
