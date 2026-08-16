package com.orbitgard.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;

@Schema(description = "Spent-so-far against a configured ceiling, for one limit window.")
public record LimitProgressResponse(
        @Schema(description = "COMPLETED debits recorded inside the window.", example = "60.00")
        BigDecimal spent,

        @Schema(description = "The ceiling configured on the child's SpendingLimit row.", example = "150.00")
        BigDecimal max
) {
}
