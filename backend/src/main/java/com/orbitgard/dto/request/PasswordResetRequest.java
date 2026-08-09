package com.orbitgard.dto.request;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

@Schema(description = "The email address to send a password reset link to, if it belongs to an account")
public record PasswordResetRequest(

        @Schema(description = "The account's registered email address", example = "mohamed@example.com")
        @NotBlank(message = "Enter a valid email address")
        @Email(message = "Enter a valid email address")
        String email
) {}