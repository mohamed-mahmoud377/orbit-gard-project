package com.orbitgard.auth.dto.response;

import com.orbitgard.enums.UserStatus;
import lombok.Builder;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 201 Created body for POST /api/v1/auth/register.
 *
 * Deliberately carries no tokens — the account exists but is not yet
 * active, and issuing a token here would let an unverified account
 * call the API. status is always UserStatus.PENDING_VERIFICATION at
 * this point; Jackson serialises it as "PENDING_VERIFICATION".
 */
@Builder
public record RegisterResponse(
        UUID id,
        String username,
        String email,
        UserStatus status,
        OffsetDateTime createdAt
) {}