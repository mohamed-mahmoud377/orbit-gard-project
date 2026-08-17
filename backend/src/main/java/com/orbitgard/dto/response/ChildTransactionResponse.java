package com.orbitgard.dto.response;

import com.orbitgard.enums.AccountType;
import com.orbitgard.enums.TransactionDirection;
import com.orbitgard.enums.TransactionStatus;
import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

@Schema(description = "One row in a child's activity feed, shaped for the parent's view rather than the raw ledger.")
public record ChildTransactionResponse(
        UUID id,

        @Schema(description = "Who the money went to or came from. Parsed from the description for external payments, the counterparty handle for internal transfers, and a fixed label for top-ups and promos. Null when none of those apply.", example = "School canteen")
        String merchant,

        @Schema(description = "The ledger reference, quotable to support.", example = "TXN-20260809120130123-482917")
        String reference,

        @Schema(description = "Which flow wrote this row: /pay, /transfer, /topup, or /promo.", example = "/pay")
        String channel,
        @Schema(description="transaction direction (debit - credit)")
        TransactionDirection  transactionDirection,

        @Schema(description = "Signed EGP amount — negative for debits, positive for credits. The stored amount is always positive; the sign is derived from direction.", example = "-50.00")
        BigDecimal amount,

        TransactionStatus status,

        @Schema(description = "Why a transaction was rejected. Always null today: no rejection reason is persisted anywhere. See the endpoint description.", nullable = true)
        String reason,

        @Schema(description = "When the transaction was recorded.")
        OffsetDateTime occurredAt
) {
}
