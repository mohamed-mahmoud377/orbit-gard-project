package com.orbitgard.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;

@Schema(description = "Monthly wallet activity summary shown at the top of the Transactions tab.")
public record WalletTransactionSummaryResponse(
        @Schema(description = "Sum of COMPLETED credits recorded so far this month.", example = "1500.00")
        BigDecimal moneyInThisMonth,
        @Schema(description = "Sum of COMPLETED debits recorded so far this month.", example = "715.00")
        BigDecimal moneyOutThisMonth,
        @Schema(description = "Money currently held — same value as WalletBalanceResponse.held.", example = "50.00")
        BigDecimal currentlyHeld,
        @Schema(description = "Count of REJECTED transactions. TransactionStatus has no EXPIRED value yet, so this only counts REJECTED for now.", example = "2")
        long rejectedCount
) {
}