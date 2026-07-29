package com.orbitgard.dto.request;

import jakarta.validation.constraints.NotBlank;


public record LoginRequest(

        @NotBlank(message = "FIELD_REQUIRED")
        String username,

        @NotBlank(message = "FIELD_REQUIRED")
        String password,

        boolean rememberMe
) {
}
