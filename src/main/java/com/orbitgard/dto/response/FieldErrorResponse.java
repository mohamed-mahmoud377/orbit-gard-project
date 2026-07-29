package com.orbitgard.dto.response;

/**
 * One entry in ErrorResponse.fieldErrors. Present only when something
 * the user typed is wrong — names the exact form field so the client
 * can attach the message under the right input.
 */
public record FieldErrorResponse(
        String field,
        String code
) {
}
