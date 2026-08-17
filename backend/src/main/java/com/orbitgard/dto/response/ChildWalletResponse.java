package com.orbitgard.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;
import java.util.List;

@Schema(description = "The child's own wallet screen: balances, both limit windows, money still being checked, and the last few movements.")
public record ChildWalletResponse(
        @Schema(description = "Spendable balance — balance minus held.", example = "245.00") BigDecimal available,
        @Schema(example = "295.00") BigDecimal balance,
        @Schema(description = "Money held against pending credits.", example = "50.00") BigDecimal held,

        ChildDailyWindowResponse today,
        ChildMonthlyWindowResponse month,

        @Schema(description = "Per-transaction ceiling. Has no window, so no spent or remaining figure applies.", example = "100.00")
        BigDecimal perTransaction,

        @Schema(description = "Transactions still being checked, newest first.")
        List<ChildPendingItemResponse> pending,

        @Schema(description = "The last few movements, newest first. Same shape as the full activity list.")
        List<ChildTransactionResponse> recentActivity
) {
}
