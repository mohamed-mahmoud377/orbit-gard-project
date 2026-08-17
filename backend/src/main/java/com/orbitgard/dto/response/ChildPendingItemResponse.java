package com.orbitgard.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * A "being checked" row on the child's wallet screen.
 *
 * In the current schema the only transactions that sit in PENDING are large
 * incoming credits held by TransactionRules — outgoing payments either
 * complete or are refused outright. So this list shows money arriving that
 * has not cleared, not purchases awaiting approval.
 */
@Schema(description = "A transaction still being checked. Today this is only held incoming money.")
public record ChildPendingItemResponse(
        UUID id,
        @Schema(description = "Counterparty handle, or a fixed label for top-ups and promos.", example = "@dad")
        String merchant,
        @Schema(description = "Always-positive EGP amount.", example = "50.00") BigDecimal amount,
        @Schema(description = "HH:mm in UTC, matching the windows the limits are cut on.", example = "12:15")
        String time
) {
}
