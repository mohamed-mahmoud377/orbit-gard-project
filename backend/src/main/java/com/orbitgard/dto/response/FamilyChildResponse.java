package com.orbitgard.dto.response;

import com.orbitgard.enums.UserStatus;
import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;
import java.util.UUID;

@Schema(description = "One child card on the parent's Family tab: identity, wallet snapshot, and limit progress.")
public record FamilyChildResponse(
        @Schema(description = "The child user id.")
        UUID id,

        @Schema(description = "First and last name joined for display.", example = "Youssef Mahmoud")
        String name,

        @Schema(description = "The child's username, prefixed with @.", example = "@youssef")
        String handle,

        @Schema(description = "Account status of the child.", example = "ACTIVE")
        UserStatus status,

        @Schema(description = "Spendable balance — balance minus held.", example = "245.00")
        BigDecimal available,

        @Schema(description = "Recorded wallet balance.", example = "295.00")
        BigDecimal balance,

        @Schema(description = "Money held against pending transactions.", example = "50.00")
        BigDecimal held,

        @Schema(description = "Configured ceilings and progress against them.")
        FamilyChildLimitsResponse limits
) {
}
