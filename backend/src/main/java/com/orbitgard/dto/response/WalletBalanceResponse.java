package com.orbitgard.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;

@Schema(description = "The authenticated user's wallet figures. Available is always balance minus held.")
public record WalletBalanceResponse(
        @Schema(description = "All money recorded in the wallet, including pending credits.", example = "295.00")
        BigDecimal balance,
        @Schema(description = "Money recorded but not yet spendable.", example = "50.00")
        BigDecimal held,
        @Schema(description = "Spendable money: balance minus held. This value is derived, never stored.", example = "245.00")
        BigDecimal available
) {
}
