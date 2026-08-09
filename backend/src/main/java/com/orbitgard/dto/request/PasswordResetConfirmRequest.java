package com.orbitgard.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record PasswordResetConfirmRequest(
        @NotBlank(message = "This field is required")
        String token,

        @NotBlank(message = "This field is required")
        @Size(min = 8, message = "At least 8 characters, with a letter and a number")
        @Size(max = 64, message = "Maximum 64 characters")
        @Pattern(
                regexp = "^(?=.*[A-Za-z])(?=.*\\d).+$",
                message = "At least 8 characters, with a letter and a number"
        )
        String newPassword,

        @NotBlank(message = "This field is required")
        String confirmNewPassword
) {}