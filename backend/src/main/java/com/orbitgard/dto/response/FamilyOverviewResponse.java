package com.orbitgard.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;

@Schema(description = "Aggregate stats bar at the top of the parent's Family tab.")
public record FamilyOverviewResponse(
        @Schema(description = "Number of CHILD accounts under the authenticated parent.", example = "2")
        int childrenCount,

        @Schema(description = "Sum of COMPLETED internal transfers from the parent's wallet into child wallets so far this month (UTC).", example = "800.00")
        BigDecimal allocatedThisMonth,

        @Schema(description = "Sum of COMPLETED debits across all child wallets so far this month (UTC).", example = "415.00")
        BigDecimal spentThisMonth,

        @Schema(description = "Count of REJECTED transactions across all child wallets this month. TransactionStatus has no BLOCKED value yet, so this only counts REJECTED for now.", example = "3")
        long blockedAttempts
) {
}
