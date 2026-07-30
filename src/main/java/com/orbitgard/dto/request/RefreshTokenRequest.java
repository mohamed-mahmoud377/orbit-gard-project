package com.orbitgard.dto.request;

import jakarta.validation.constraints.NotBlank;

public record RefreshTokenRequest(
        @NotBlank(message = "FIELD_REQUIRED")
        String refreshToken
) {
}
