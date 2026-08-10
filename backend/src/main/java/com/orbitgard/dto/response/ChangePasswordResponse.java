package com.orbitgard.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "Confirmation that a password was changed and how many devices were signed out")
public record ChangePasswordResponse(

        @Schema(description = "Human-readable confirmation message", example = "Your password has been changed. Please sign in again.")
        String message,

        @Schema(description = "Number of devices that were signed out as a result of this change", example = "4")
        int devicesSignedOut
) {}