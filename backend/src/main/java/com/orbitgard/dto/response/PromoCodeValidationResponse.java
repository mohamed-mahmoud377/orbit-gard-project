package com.orbitgard.dto.response;

import com.orbitgard.enums.PromoCodeValidationStatus;
import lombok.Builder;

/**
 * 200 OK body for GET /api/v1/auth/promo-code.
 *
 * Always 200 — unknown or malformed codes are INVALID, not client errors.
 */
@Builder
public record PromoCodeValidationResponse(
        PromoCodeValidationStatus status,
        Long amount
) {}
