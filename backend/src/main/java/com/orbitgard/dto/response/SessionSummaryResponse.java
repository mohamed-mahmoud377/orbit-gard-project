package com.orbitgard.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.OffsetDateTime;
import java.util.UUID;

@Schema(description = "Summary of an active session belonging to the authenticated user")
public record SessionSummaryResponse(

        @Schema(description = "Session identifier", example = "3fa85f64-5717-4562-b3fc-2c963f66afa6")
        UUID id,

        @Schema(description = "Human-readable device label, if known", example = "iPhone 15 · Safari")
        String deviceLabel,

        @Schema(description = "Approximate geolocation and/or IP address of the session", example = "Cairo, EG · 41.34.12.7")
        String location,

        @Schema(description = "Timestamp the session was last used")
        OffsetDateTime lastUsedAt,

        @Schema(description = "Whether this session is the one making the current request")
        boolean currentDevice
) {
}