package com.orbitgard.dto.request;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;

import java.math.BigDecimal;

/**
 * PATCH semantics: every field is optional. A null field means "leave this
 * ceiling alone", not "clear it" — the spending_limit columns are NOT NULL
 * and a child must always have all three. At least one must be present.
 *
 * Ordering (perTransaction <= daily <= monthly) is checked against the
 * MERGED result, not against the submitted fields alone, so raising one
 * ceiling in isolation can still be rejected by the two it must sit under.
 */
@Schema(description = "Partial update of a child's spending ceilings. Omit a field to leave it unchanged.")
public record UpdateChildLimitsRequest(

        @Schema(description = "New per-transaction ceiling, or omit to keep the current one.", example = "100.00")
        @DecimalMin(value = "0.01", message = "AMOUNT_INVALID")
        @Digits(integer = 12, fraction = 2, message = "AMOUNT_INVALID")
        BigDecimal maxPerTransaction,

        @Schema(description = "New daily ceiling, or omit to keep the current one.", example = "150.00")
        @DecimalMin(value = "0.01", message = "AMOUNT_INVALID")
        @Digits(integer = 12, fraction = 2, message = "AMOUNT_INVALID")
        BigDecimal dailyLimit,

        @Schema(description = "New monthly ceiling, or omit to keep the current one.", example = "1000.00")
        @DecimalMin(value = "0.01", message = "AMOUNT_INVALID")
        @Digits(integer = 12, fraction = 2, message = "AMOUNT_INVALID")
        BigDecimal monthlyLimit
) {
}
