package com.orbitgard.dto.request;

import com.orbitgard.validation.annotation.ValidName;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;

public record UpdateProfileRequest(
        @Schema(description = "First name. Maximum 30 English letters, with optional spaces, hyphens, or apostrophes.", example = "Mariam")
        @ValidName
        String firstName,

        @Schema(description = "Last name. Maximum 30 English letters, with optional spaces, hyphens, or apostrophes.", example = "Hassan")
        @ValidName
        String lastName,

        @Schema(description = "Egyptian mobile number beginning with 010, 011, 012, or 015.", example = "01012345678")
        @NotBlank(message = "FIELD_REQUIRED")
        String phoneNumber,

        @Schema(description = "Current username, included for display only. Its submitted value is ignored and cannot update the username.", example = "mariam.hassan")
        /**
         * Included so the profile form can submit its complete displayed
         * state. It is deliberately ignored by the update service: usernames
         * can only be changed through their dedicated flow when one exists.
         */
        String username
) {
}
