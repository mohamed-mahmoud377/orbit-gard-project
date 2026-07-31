package com.orbitgard.dto.response;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class ResendVerificationResponse {
    private String message;
    private long retryAfterSeconds;
}