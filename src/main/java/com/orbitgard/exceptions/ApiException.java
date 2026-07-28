package com.orbitgard.exceptions;


/**
 * Thrown by services (SignupService, UsernameAvailabilityService, ...) when
 * a business rule fails - a taken username, an invalid phone number, and so
 * on. GlobalExceptionHandler catches this and turns it into an ErrorResponse.
 *
 * field is nullable: some errors (e.g. INTERNAL_ERROR) aren't tied to a
 * single request field.
 */
public class ApiException extends RuntimeException {

    private final ErrorCode errorCode;
    private final String field;

    public ApiException(ErrorCode errorCode) {
        this(errorCode, null);
    }

    public ApiException(ErrorCode errorCode, String field) {
        super(errorCode.name());
        this.errorCode = errorCode;
        this.field = field;
    }

    public ErrorCode getErrorCode() {
        return errorCode;
    }

    public String getField() {
        return field;
    }
}