package com.orbitgard.dto.response;

import com.orbitgard.enums.AccountType;

public record UserSummaryResponse(
        Long id,
        String username,
        String firstName,
        String lastName,
        AccountType accountType
) {
}
