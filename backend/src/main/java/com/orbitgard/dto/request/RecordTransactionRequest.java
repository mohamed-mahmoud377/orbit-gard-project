package com.orbitgard.dto.request;

import com.orbitgard.enums.TransactionDirection;
import com.orbitgard.enums.TransactionType;
import com.orbitgard.validation.annotation.ValidTransactionTypeDirection;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import lombok.Builder;

import java.util.UUID;

/**
 * Internal command for recording a wallet transaction (ORB-011).
 */
@Builder
@ValidTransactionTypeDirection
public record RecordTransactionRequest(
        @NotNull UUID walletId,
        @NotNull TransactionType type,
        @NotNull TransactionDirection direction,
        @Positive long amountCents,
        @Size(max = 500) String description,
        @Size(max = 255) String counterparty,
        UUID counterpartyWalletId,
        UUID relatedTransactionId,
        UUID paymentId
) {
}
