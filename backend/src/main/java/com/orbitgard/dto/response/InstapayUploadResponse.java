package com.orbitgard.dto.response;

import com.orbitgard.enums.InstapayRequestStatus;
import lombok.Builder;

import java.time.OffsetDateTime;
import java.util.UUID;

@Builder
public record InstapayUploadResponse(
        UUID id,
        InstapayRequestStatus status,
        OffsetDateTime createdAt,
        String message
) {
}
