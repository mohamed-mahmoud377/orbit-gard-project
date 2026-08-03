package com.orbitgard.dto.request;

import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public record TopUpRequest(
        @NotNull(message = "FIELD_REQUIRED")
        BigDecimal amount
) {
}
