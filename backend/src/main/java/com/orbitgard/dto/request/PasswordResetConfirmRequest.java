package com.orbitgard.dto.request;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

@Schema(description = "Fields required to set a new password using a reset link. No current password is required — the token itself proves identity")
public record PasswordResetConfirmRequest(

        @Schema(description = "The raw token from the reset link's URL", example = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI...")
        @NotBlank(message = "This field is required")
        String token,

        @Schema(description = "The new password. 8 to 64 characters, at least one letter and one number", example = "NewPass456")
        @NotBlank(message = "This field is required")
        @Size(min = 8, message = "At least 8 characters, with a letter and a number")
        @Size(max = 64, message = "Maximum 64 characters")
        @Pattern(
                regexp = "^(?=.*[A-Za-z])(?=.*\\d).+$",
                message = "At least 8 characters, with a letter and a number"
        )
        String newPassword,

        @Schema(description = "Must match newPassword exactly", example = "NewPass456")
        @NotBlank(message = "This field is required")
        String confirmNewPassword
) {}