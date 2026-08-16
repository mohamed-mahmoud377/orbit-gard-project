package com.orbitgard.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;

@Schema(description = "Full limits block for one child, including headroom.")
public record FamilyChildDetailLimitsResponse(
        @Schema(description = "Daily window, counted over the current UTC day.")
        LimitWindowResponse today,

        @Schema(description = "Monthly window, counted over the current UTC month.")
        LimitWindowResponse month,

        @Schema(description = "Per-transaction ceiling. Has no window, so no spent or remaining figure applies.", example = "100.00")
        BigDecimal perTransaction
) {
}
