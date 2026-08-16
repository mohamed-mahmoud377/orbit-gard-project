package com.orbitgard.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;

/**
 * A limit window on the child detail screen.
 *
 * Deliberately separate from LimitProgressResponse rather than adding
 * `remaining` to it: the list endpoint's payload is already specified and
 * under test, and the card list has no room to render a third figure.
 */
@Schema(description = "Spent, ceiling, and headroom for one limit window.")
public record LimitWindowResponse(
        @Schema(description = "COMPLETED debits recorded inside the window.", example = "60.00")
        BigDecimal spent,

        @Schema(description = "The ceiling configured on the child's SpendingLimit row.", example = "150.00")
        BigDecimal max,

        @Schema(description = "max - spent, floored at zero. Lowering a limit below what is already spent yields 0, never a negative number.", example = "90.00")
        BigDecimal remaining
) {
}
