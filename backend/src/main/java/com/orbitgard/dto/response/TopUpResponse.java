package com.orbitgard.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;
import java.util.UUID;

public record TopUpResponse(
        UUID paymentId,
        String redirectUrl,
        @Schema(description = "What lands in the wallet — the amount the user asked for.", example = "1000.00")
        BigDecimal creditAmount,

        @Schema(description = "The service fee added on top, 1% of the credit.", example = "10.00")
        BigDecimal feeAmount,

        @Schema(description = "What the card is charged: credit + fee. This is the figure sent to Paymob.", example = "1010.00")
        BigDecimal chargeAmount
) {
}
