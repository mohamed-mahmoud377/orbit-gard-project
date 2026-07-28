package com.orbitgard.exceptions;

import org.springframework.http.HttpStatus;

/**
 * Every error code the Identity module can return, tied to the HTTP status
 * the API contract specifies for it. Never build an error code as a raw
 * string in a controller or service - always go through this enum, per the
 * "error codes come from the error catalogue" convention.
 */
public enum ErrorCode {

    // --- Registration (POST /api/v1/auth/register) ---
    NAME_INVALID(HttpStatus.BAD_REQUEST),
    USERNAME_INVALID(HttpStatus.BAD_REQUEST),
    USERNAME_TAKEN(HttpStatus.CONFLICT),
    EMAIL_INVALID(HttpStatus.BAD_REQUEST),
    EMAIL_TAKEN(HttpStatus.CONFLICT),
    PHONE_INVALID(HttpStatus.BAD_REQUEST),
    PHONE_NOT_EGYPTIAN(HttpStatus.BAD_REQUEST),
    PHONE_TAKEN(HttpStatus.CONFLICT),
    PASSWORD_INVALID(HttpStatus.BAD_REQUEST),
    PASSWORD_CONFIRMATION_MISMATCH(HttpStatus.BAD_REQUEST),

    // --- Generic / cross-cutting ---
    VALIDATION_ERROR(HttpStatus.BAD_REQUEST),
    INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR);

    private final HttpStatus httpStatus;

    ErrorCode(HttpStatus httpStatus) {
        this.httpStatus = httpStatus;
    }

    public HttpStatus getHttpStatus() {
        return httpStatus;
    }
}