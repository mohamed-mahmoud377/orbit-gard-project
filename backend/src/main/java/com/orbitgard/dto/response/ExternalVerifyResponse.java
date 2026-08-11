package com.orbitgard.dto.response;

import java.time.OffsetDateTime;

public record ExternalVerifyResponse(
        String verificationToken,
        OffsetDateTime expiresAt
) {
}
