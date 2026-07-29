package com.orbitgard.dto.auth;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class ResendVerificationResponse {
    private String message;
    private long retryAfterSeconds;
}