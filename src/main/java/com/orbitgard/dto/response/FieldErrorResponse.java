package com.orbitgard.dto.response;

import lombok.Builder;

/**
 * One entry in ErrorResponse.fieldErrors. Present only when something
 * the user typed is wrong — names the exact form field so the client
 * can attach the message under the right input.
 */
@Builder
public record FieldErrorResponse(
        String field,
        String code
) {}