package com.orbitgard.exceptions;

import org.springframework.http.HttpStatus;

public enum ErrorCode {

    FIELD_REQUIRED(HttpStatus.BAD_REQUEST, "field-required", "Field required"),
    NAME_INVALID(HttpStatus.BAD_REQUEST, "name-invalid", "Invalid name"),
    USERNAME_INVALID(HttpStatus.BAD_REQUEST, "username-invalid", "Invalid username"),
    USERNAME_TAKEN(HttpStatus.CONFLICT, "username-taken", "Username taken"),
    EMAIL_INVALID(HttpStatus.BAD_REQUEST, "email-invalid", "Invalid email address"),
    EMAIL_TAKEN(HttpStatus.CONFLICT, "email-taken", "Email already registered"),
    PHONE_INVALID(HttpStatus.BAD_REQUEST, "phone-invalid", "Invalid phone number"),
    PHONE_NOT_EGYPTIAN(HttpStatus.BAD_REQUEST, "phone-not-egyptian", "Not an Egyptian number"),
    PHONE_TAKEN(HttpStatus.CONFLICT, "phone-taken", "Phone already registered"),
    PASSWORD_TOO_WEAK(HttpStatus.BAD_REQUEST, "password-too-weak", "Password too weak"),
    PASSWORD_MISMATCH(HttpStatus.BAD_REQUEST, "password-mismatch", "Passwords do not match"),
    RATE_LIMITED(HttpStatus.TOO_MANY_REQUESTS, "rate-limited", "Too many requests"),
    VALIDATION_ERROR(HttpStatus.BAD_REQUEST, "validation-error", "Validation failed"),
    INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "internal-error", "Internal error"),
    INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED, "invalid-credentials", "Invalid credentials"),
    INVALID_REFRESH_TOKEN(HttpStatus.UNAUTHORIZED, "invalid-refresh-token", "Invalid or expired refresh token"),
    ACCOUNT_NOT_VERIFIED(HttpStatus.FORBIDDEN, "account-not-verified", "Account not verified"),
    ACCOUNT_SUSPENDED(HttpStatus.FORBIDDEN, "account-suspended", "Account suspended"),
    TOO_MANY_ATTEMPTS(HttpStatus.TOO_MANY_REQUESTS, "too-many-attempts", "Too many attempts"),
    TOKEN_INVALID(HttpStatus.BAD_REQUEST, "token-invalid", "Invalid token"),
    TOKEN_EXPIRED(HttpStatus.GONE, "token-expired", "Token expired"),
    TOKEN_ALREADY_USED(HttpStatus.GONE, "token-already-used", "Token already used"),
    AMOUNT_BELOW_MINIMUM(HttpStatus.BAD_REQUEST, "amount-below-minimum", "Amount below minimum"),
    AMOUNT_ABOVE_MAXIMUM(HttpStatus.BAD_REQUEST, "amount-above-maximum", "Amount above maximum"),
    AMOUNT_INVALID(HttpStatus.BAD_REQUEST, "amount-invalid", "Amount must be greater than zero"),
    CHILD_CANNOT_TOP_UP(HttpStatus.FORBIDDEN, "child-cannot-top-up", "Child accounts cannot add money"),
    PAYMOB_UNREACHABLE(HttpStatus.SERVICE_UNAVAILABLE, "paymob-unreachable", "Payment provider unavailable"),
    PAYMENT_NOT_FOUND(HttpStatus.NOT_FOUND, "payment-not-found", "Payment not found");

    private final HttpStatus httpStatus;
    private final String typeSlug;
    private final String title;

    ErrorCode(HttpStatus httpStatus, String typeSlug, String title) {
        this.httpStatus = httpStatus;
        this.typeSlug = typeSlug;
        this.title = title;
    }

    public HttpStatus getHttpStatus() {
        return httpStatus;
    }

    public String getTypeSlug() {
        return typeSlug;
    }

    public String getTitle() {
        return title;
    }
}