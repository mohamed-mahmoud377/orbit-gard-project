package com.orbitgard.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
public class RateLimitedException extends ApiException {

    private final long retryAfterSeconds;

    public RateLimitedException(long retryAfterSeconds) {
        super("RATE_LIMITED", HttpStatus.TOO_MANY_REQUESTS, "Too many requests",
                "A verification email was already sent recently. Please wait before requesting another.");
        this.retryAfterSeconds = retryAfterSeconds;
    }
}