package com.orbitgard.dto.response;

import com.orbitgard.enums.AccountType;

import java.util.UUID;

public record UserSummaryResponse(
        UUID id,
        String username,
        String firstName,
        String lastName,
        AccountType accountType
) {
}
