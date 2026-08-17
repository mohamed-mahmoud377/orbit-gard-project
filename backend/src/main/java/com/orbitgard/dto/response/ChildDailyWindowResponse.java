package com.orbitgard.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;

@Schema(description = "The child's daily allowance window.")
public record ChildDailyWindowResponse(
        @Schema(example = "60.00") BigDecimal spent,
        @Schema(example = "150.00") BigDecimal max,
        @Schema(description = "max - spent, floored at zero.", example = "90.00") BigDecimal remaining,
        @Schema(description = "When the daily window rolls over. Always the literal \"midnight\" — and it is UTC midnight, since enforcement cuts the day in UTC.", example = "midnight")
        String resetsAt
) {
}
