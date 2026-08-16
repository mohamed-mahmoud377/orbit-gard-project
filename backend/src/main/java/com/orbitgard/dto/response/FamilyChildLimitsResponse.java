package com.orbitgard.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;

@Schema(description = "The child's three spending ceilings plus progress against the two windowed ones.")
public record FamilyChildLimitsResponse(
        @Schema(description = "Progress against the daily limit, counted over the current UTC day.")
        LimitProgressResponse today,

        @Schema(description = "Progress against the monthly limit, counted over the current UTC month.")
        LimitProgressResponse month,

        @Schema(description = "Per-transaction ceiling. Has no window, so no spent figure applies.", example = "100.00")
        BigDecimal perTransaction
) {
}
