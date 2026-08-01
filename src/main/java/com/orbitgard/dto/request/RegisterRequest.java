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
    public static Builder builder() {
        return new Builder();
    }

    public static final class Builder {
        private String firstName;
        private String lastName;
        private String username;
        private String email;
        private String phoneNumber;
        private String password;
        private String confirmPassword;
        private String promoCode;

        public Builder firstName(String firstName) {
            this.firstName = firstName;
            return this;
        }

        public Builder lastName(String lastName) {
            this.lastName = lastName;
            return this;
        }

        public Builder username(String username) {
            this.username = username;
            return this;
        }

        public Builder email(String email) {
            this.email = email;
            return this;
        }

        public Builder phoneNumber(String phoneNumber) {
            this.phoneNumber = phoneNumber;
            return this;
        }

        public Builder password(String password) {
            this.password = password;
            return this;
        }

        public Builder confirmPassword(String confirmPassword) {
            this.confirmPassword = confirmPassword;
            return this;
        }

        public Builder promoCode(String promoCode) {
            this.promoCode = promoCode;
            return this;
        }

        public RegisterRequest build() {
            return new RegisterRequest(
                    firstName,
                    lastName,
                    username,
                    email,
                    phoneNumber,
                    password,
                    confirmPassword,
                    promoCode
            );
        }
    }
}
