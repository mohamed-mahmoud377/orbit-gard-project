package com.orbitgard.dto.response;

import com.orbitgard.enums.UserStatus;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

public record AddChildResponse(
        UUID id,
        String username,
        String firstName,
        String lastName,
        UserStatus status,
        UUID parentId,
        BigDecimal maxPerTransaction,
        BigDecimal dailyLimit,
        BigDecimal monthlyLimit,
        OffsetDateTime createdAt
) {}