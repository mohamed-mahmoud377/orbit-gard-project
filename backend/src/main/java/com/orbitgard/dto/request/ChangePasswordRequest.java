package com.orbitgard.dto.request;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

@Schema(description = "Fields required to change a known password")
public record ChangePasswordRequest(

        @Schema(description = "The user's current password, used to prove identity", example = "OldPass123")
        @NotBlank(message = "This field is required")
        String currentPassword,

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