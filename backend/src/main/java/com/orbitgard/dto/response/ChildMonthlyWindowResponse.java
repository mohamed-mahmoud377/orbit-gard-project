package com.orbitgard.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;
import java.time.LocalDate;

@Schema(description = "The child's monthly allowance window.")
public record ChildMonthlyWindowResponse(
        @Schema(example = "255.00") BigDecimal spent,
        @Schema(example = "1000.00") BigDecimal max,
        @Schema(description = "max - spent, floored at zero.", example = "745.00") BigDecimal remaining,
        @Schema(description = "The next reset — the 1st of next month, UTC. This is when the window CLEARS, not when it opened.", example = "2026-09-01")
        LocalDate resetsOn
) {
}
