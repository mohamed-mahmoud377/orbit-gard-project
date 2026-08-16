package com.orbitgard.dto.response;

import com.orbitgard.enums.UserStatus;
import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

@Schema(description = "One child's detail screen: header, wallet snapshot, and full limits block.")
public record FamilyChildDetailResponse(
        UUID id,

        @Schema(description = "First and last name joined for display.", example = "Youssef Mahmoud")
        String name,

        @Schema(description = "The child's username, prefixed with @.", example = "@youssef")
        String handle,

        @Schema(description = "Account status of the child.", example = "ACTIVE")
        UserStatus status,

        @Schema(description = "Date the child's wallet row was created, in UTC.", example = "2026-06-12")
        LocalDate walletOpenedAt,

        @Schema(description = "Spendable balance — balance minus held.", example = "245.00")
        BigDecimal available,

        @Schema(description = "Recorded wallet balance.", example = "295.00")
        BigDecimal balance,

        @Schema(description = "Money held against pending credits.", example = "50.00")
        BigDecimal held,

        @Schema(description = "COMPLETED internal transfers from the parent's wallet into this child's wallet so far this month (UTC).", example = "500.00")
        BigDecimal allocatedThisMonth,

        @Schema(description = "Configured ceilings, progress, and headroom.")
        FamilyChildDetailLimitsResponse limits
) {
}
