package com.orbitgard.exceptions;

import com.orbitgard.dto.response.FieldErrorResponse;

import java.util.List;

/**
 * Thrown when one or more request fields fail shape/format validation or
 * uniqueness checks, carrying every failure at once - never just the
 * first one. The contract requires this: a user with both a taken email
 * and a taken phone number must see both problems in one response, not
 * one at a time across repeated submissions.
 *
 * ApiException stays single-error, for the cases where only one thing
 * can plausibly fail (e.g. an internal error). This is the multi-error
 * counterpart, used specifically by SignupService steps 1 and 3.
 */
public class ValidationException extends RuntimeException {

    private final List<FieldErrorResponse> fieldErrors;

    public ValidationException(List<FieldErrorResponse> fieldErrors) {
        super("VALIDATION_ERROR");
        this.fieldErrors = fieldErrors;
    }

    public List<FieldErrorResponse> getFieldErrors() {
        return fieldErrors;
    }
}