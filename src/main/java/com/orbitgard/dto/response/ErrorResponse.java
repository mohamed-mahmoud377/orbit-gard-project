package com.orbitgard.dto.response;

import lombok.Builder;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * The single error shape every endpoint returns, as application/problem+json.
 *
 * fieldErrors is populated only for validation failures, and holds every
 * field that failed at once — never just the first one — so the caller
 * can show all problems together instead of one at a time.
 */
@Builder
public record ErrorResponse(
        String type,
        String title,
        int status,
        String code,
        String detail,
        String instance,
        OffsetDateTime timestamp,
        String traceId,
        List<FieldErrorResponse> fieldErrors
) {}