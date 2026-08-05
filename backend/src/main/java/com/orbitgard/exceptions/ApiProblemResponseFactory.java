package com.orbitgard.exceptions;

import com.orbitgard.dto.response.ErrorResponse;
import com.orbitgard.dto.response.FieldErrorResponse;
import org.slf4j.MDC;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

/** Creates the one RFC 7807-style error body used by HTTP and security errors. */
public final class ApiProblemResponseFactory {

    private ApiProblemResponseFactory() {
    }

    public static ErrorResponse create(ErrorCode errorCode, String detail, String instance,
                                       List<FieldErrorResponse> fieldErrors) {
        String traceId = MDC.get("traceId");
        if (traceId == null) {
            traceId = UUID.randomUUID().toString();
        }

        return ErrorResponse.builder()
                .type("https://orbit.local/errors/" + errorCode.getTypeSlug())
                .title(errorCode.getTitle())
                .status(errorCode.getHttpStatus().value())
                .code(errorCode.name())
                .detail(detail)
                .instance(instance)
                .timestamp(OffsetDateTime.now(ZoneOffset.UTC))
                .traceId(traceId)
                .fieldErrors(fieldErrors)
                .build();
    }
}
