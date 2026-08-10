package com.orbitgard.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "Confirmation that the password was successfully reset")
public record PasswordResetConfirmResponse(

        @Schema(description = "Human-readable confirmation message", example = "Your password is updated. You can now sign in with your new password.")
        String message
) {}