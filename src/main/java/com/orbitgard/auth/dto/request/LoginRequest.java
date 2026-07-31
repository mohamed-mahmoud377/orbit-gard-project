package com.orbitgard.auth.dto.request;

import jakarta.validation.constraints.NotBlank;


public record LoginRequest(

        @NotBlank(message = "FIELD_REQUIRED")
        String username,

        @NotBlank(message = "FIELD_REQUIRED")
        String password,

        boolean rememberMe
) {
    public static Builder builder() {
        return new Builder();
    }

    public static final class Builder {
        private String username;
        private String password;
        private boolean rememberMe;

        public Builder username(String username) {
            this.username = username;
            return this;
        }

        public Builder password(String password) {
            this.password = password;
            return this;
        }

        public Builder rememberMe(boolean rememberMe) {
            this.rememberMe = rememberMe;
            return this;
        }

        public LoginRequest build() {
            return new LoginRequest(username, password, rememberMe);
        }
    }
}
