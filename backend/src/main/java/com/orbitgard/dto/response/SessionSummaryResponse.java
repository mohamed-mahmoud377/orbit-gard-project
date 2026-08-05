package com.orbitgard.dto.response;

import java.time.OffsetDateTime;
import java.util.UUID;

public record SessionSummaryResponse(
        UUID id,
        String deviceLabel,
        String location,
        OffsetDateTime lastUsedAt,
        boolean currentDevice
) {
}
