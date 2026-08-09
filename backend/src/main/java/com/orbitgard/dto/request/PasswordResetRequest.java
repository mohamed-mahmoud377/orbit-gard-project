package com.orbitgard.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record PasswordResetRequest(
        @NotBlank(message = "Enter a valid email address")
        @Email(message = "Enter a valid email address")
        String email
) {}