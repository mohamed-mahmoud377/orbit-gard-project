package com.orbitgard.exception;

import org.springframework.http.HttpStatus;

public class TokenExpiredException extends ApiException {
    public TokenExpiredException() {
        super("TOKEN_EXPIRED", HttpStatus.GONE, "This activation link has expired.");
    }
}