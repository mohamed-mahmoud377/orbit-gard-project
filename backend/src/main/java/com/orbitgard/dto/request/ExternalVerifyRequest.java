package com.orbitgard.dto.request;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;

public record ExternalVerifyRequest(

        @Schema(description = "The shopper's Orbit-Gard username", example = "omar123")
        @NotBlank(message = "FIELD_REQUIRED")
        String username,

        @Schema(description = "The shopper's Orbit-Gard password", example = "MyPass123")
        @NotBlank(message = "FIELD_REQUIRED")
        String password
) {
}
