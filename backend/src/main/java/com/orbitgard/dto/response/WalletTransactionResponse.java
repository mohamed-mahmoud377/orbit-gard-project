package com.orbitgard.dto.response;

import com.orbitgard.enums.TransactionDirection;
import com.orbitgard.enums.TransactionStatus;
import com.orbitgard.enums.TransactionType;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

@Schema(description = "An immutable wallet movement. Amount is always positive; direction determines whether it increases or decreases the balance.")
public record WalletTransactionResponse(
        UUID id,
        TransactionType type,
        TransactionDirection direction,
        TransactionStatus status,
        @Schema(description = "Positive EGP amount, exact to two decimal places.", example = "500.00") BigDecimal amount,

        BigDecimal balanceBefore,

        BigDecimal balanceAfter,
        @Schema(description = "Stable support reference.", example = "e19d0a48fe8a4ce5a4f23e4e46a0bd31") String reference,
        @Schema(description = "Public transaction ID: UTC timestamp followed by random digits.", example = "TXN-20260809120130123-482917") String transactionPublicId,
        @Schema(description = "Human-readable reason for the transaction.", example = "Promotional signup bonus") String description,
        String counterparty,
        OffsetDateTime createdAt,
        OffsetDateTime resolvedAt
) {
}
