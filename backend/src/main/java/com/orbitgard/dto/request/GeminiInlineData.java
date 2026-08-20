package com.orbitgard.dto.request;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.NotBlank;
import lombok.Builder;

@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public record GeminiInlineData(

        @NotBlank(message = "FIELD_REQUIRED")
        String mimeType,

        /** Base64 of the downscaled image. Never logged. */
        @NotBlank(message = "FIELD_REQUIRED")
        String data
) {
}
