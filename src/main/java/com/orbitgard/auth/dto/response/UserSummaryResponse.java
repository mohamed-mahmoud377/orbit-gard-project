package com.orbitgard.auth.dto.response;

import com.orbitgard.enums.AccountType;
import lombok.Builder;

import java.util.UUID;

@Builder
public record UserSummaryResponse(
        UUID id,
        String username,
        String firstName,
        String lastName,
        AccountType accountType
) {}