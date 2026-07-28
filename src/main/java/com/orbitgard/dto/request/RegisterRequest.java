package com.orbitgard.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Body of POST /api/v1/auth/register.
 *
 * Only presence is checked here. Format rules (name charset, username
 * charset, Egyptian phone format, password strength) and password-match
 * all depend on normalising the input first, so they are enforced in
 * SignupService, in the order the API contract specifies — not here.
 */
public record RegisterRequest(

        @NotBlank(message = "FIELD_REQUIRED")
        String firstName,

        @NotBlank(message = "FIELD_REQUIRED")
        String lastName,

        @NotBlank(message = "FIELD_REQUIRED")
        String username,

        @NotBlank(message = "FIELD_REQUIRED")
        String email,

        @NotBlank(message = "FIELD_REQUIRED")
        String phoneNumber,

        @NotBlank(message = "FIELD_REQUIRED")
        @Size(max = 64, message = "PASSWORD_TOO_WEAK")
        String password,

        @NotBlank(message = "FIELD_REQUIRED")
        String confirmPassword,

        // Optional — captured and stored, never evaluated here (ORB-005)
        String promoCode
) {
}
