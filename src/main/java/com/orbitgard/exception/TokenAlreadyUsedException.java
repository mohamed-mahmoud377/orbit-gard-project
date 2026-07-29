package com.orbitgard.exception;

import org.springframework.http.HttpStatus;

public class TokenAlreadyUsedException extends ApiException {
    public TokenAlreadyUsedException() {
        super("TOKEN_ALREADY_USED", HttpStatus.GONE, "Activation link already used",
                "This activation link has already been used.");
    }
}