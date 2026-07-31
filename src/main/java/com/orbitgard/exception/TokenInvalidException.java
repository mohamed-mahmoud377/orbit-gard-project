package com.orbitgard.exception;

import org.springframework.http.HttpStatus;

public class TokenInvalidException extends ApiException {
    public TokenInvalidException() {
        super("TOKEN_INVALID", HttpStatus.BAD_REQUEST, "Invalid activation link",
                "This activation link is not valid.");
    }
}
