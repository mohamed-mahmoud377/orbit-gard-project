package com.orbitgard.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;

/**
 * Where to send the money, and what Orbit will accept.
 *
 * This endpoint is not asked for by ORB-013 — the story treats the number
 * and the name as screen copy. It exists because the alternative is worse:
 * the account number arrives through the INSTAPAY_ACCOUNT_NUMBER
 * environment variable, so a frontend that hardcodes it is one deploy away
 * from telling users to send real money to a number Orbit no longer
 * watches, with no error anywhere and no way to get it back. The same
 * argument covers the limits, which are InstaPay's own and could change
 * without Orbit having any say.
 *
 * Drop this if Mohamed would rather the copy stay in the design. Nothing
 * else depends on it.
 */
@Schema(description = "The InstaPay account to transfer to, and the limits Orbit will accept.")
public record InstapayAccountResponse(

        @Schema(description = "Account name the transfer must be addressed to.", example = "Mohamed Mahmoud Said")
        String accountName,

        @Schema(description = "InstaPay mobile number to send to.", example = "01111545710")
        String accountNumber,

        @Schema(description = "Smallest transfer Orbit can credit, in EGP. InstaPay's own per-transaction limit, not Orbit's.",
                example = "0.01")
        BigDecimal minAmount,

        @Schema(description = "Largest transfer Orbit can credit, in EGP. InstaPay's own per-transaction limit, not Orbit's.",
                example = "70000.00")
        BigDecimal maxAmount,

        @Schema(description = "Largest receipt image the upload endpoint accepts, in bytes.", example = "1048576")
        long maxImageBytes
) {
}
