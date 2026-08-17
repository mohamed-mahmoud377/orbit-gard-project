package com.orbitgard.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;

@Schema(description = "The child's own activity counters for the current UTC day and month.")
public record ChildActivitySummaryResponse(
        @Schema(description = "COMPLETED debits so far today (UTC).", example = "60.00")
        BigDecimal spentToday,

        @Schema(description = "COMPLETED debits so far this month (UTC).", example = "255.00")
        BigDecimal spentThisMonth,

        @Schema(description = "COMPLETED credits received this month (UTC) — from a parent, a top-up, or a promo.", example = "500.00")
        BigDecimal receivedThisMonth,

        @Schema(description = "REJECTED transactions this month. TransactionStatus has no BLOCKED value and limit violations persist nothing, so this reads 0 until blocked-attempt recording exists.", example = "0")
        long blockedCount
) {
}
