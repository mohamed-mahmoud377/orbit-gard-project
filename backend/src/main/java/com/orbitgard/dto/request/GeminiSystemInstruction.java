package com.orbitgard.dto.request;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orbitgard.gemini.GeminiPart;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import lombok.Builder;
import lombok.Singular;

import java.util.List;

/**
 * The system instruction. Carries no role — the API infers it from the
 * field name, and sending one is rejected.
 */
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public record GeminiSystemInstruction(

        @NotEmpty(message = "FIELD_REQUIRED")
        @Valid
        @Singular("part")
        List<GeminiPart> parts
) {

    public static GeminiSystemInstruction of(String instruction) {
        return GeminiSystemInstruction.builder().part(GeminiPart.text(instruction)).build();
    }
}
