package com.orbitgard.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "Generic confirmation shown regardless of whether the email address is registered")
public record PasswordResetRequestResponse(

        @Schema(description = "Neutral confirmation message, identical whether or not an account exists",
                example = "If an account exists for that address, a reset link is on its way.")
        String message
) {}