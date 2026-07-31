 package com.orbitgard.auth.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Builder;

@Builder
public record RegisterRequest(

        @NotBlank(message = "FIELD_REQUIRED")
        @Size(max = 30, message = "NAME_INVALID")
        @Pattern(
                regexp = "^[A-Za-z]+([ '\\-][A-Za-z]+)*$",
                message = "NAME_INVALID"
        )
        String firstName,

        @NotBlank(message = "FIELD_REQUIRED")
        @Size(max = 30, message = "NAME_INVALID")
        @Pattern(
                regexp = "^[A-Za-z]+([ '\\-][A-Za-z]+)*$",
                message = "NAME_INVALID"
        )
        String lastName,

        @NotBlank(message = "FIELD_REQUIRED")
        @Size(
                min = 3,
                max = 30,
                message = "USERNAME_INVALID"
        )
        @Pattern(
                regexp = "^[A-Za-z0-9._-]+$",
                message = "USERNAME_INVALID"
        )
        String username,

        @NotBlank(message = "FIELD_REQUIRED")
        @Email(message = "EMAIL_INVALID")
        @Size(max = 255, message = "EMAIL_INVALID")
        String email,

        @NotBlank(message = "FIELD_REQUIRED")
        String phoneNumber,

        @NotBlank(message = "FIELD_REQUIRED")
        @Size(min = 8, max = 64, message = "PASSWORD_TOO_WEAK")
        @Pattern(
                regexp = "^(?=.*[A-Za-z])(?=.*\\d).*$",
                message = "PASSWORD_TOO_WEAK"
        )
        String password,

        @NotBlank(message = "FIELD_REQUIRED")
        String confirmPassword,

        // Optional — captured and stored, never evaluated here (ORB-005)
        String promoCode

) {
    public RegisterRequest {
        if (promoCode != null && promoCode.isBlank()) {
            promoCode = null;
        }
    }
}
