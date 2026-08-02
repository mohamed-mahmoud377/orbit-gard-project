package com.orbitgard.dto.response;

public record LoginResponse(
        String accessToken,
        String refreshToken,
        String tokenType,
        long expiresIn,
        UserSummaryResponse user
) {
    public static Builder builder() {
        return new Builder();
    }

    public static final class Builder {
        private String accessToken;
        private String refreshToken;
        private String tokenType;
        private long expiresIn;
        private UserSummaryResponse user;

        public Builder accessToken(String accessToken) {
            this.accessToken = accessToken;
            return this;
        }

        public Builder refreshToken(String refreshToken) {
            this.refreshToken = refreshToken;
            return this;
        }

        public Builder tokenType(String tokenType) {
            this.tokenType = tokenType;
            return this;
        }

        public Builder expiresIn(long expiresIn) {
            this.expiresIn = expiresIn;
            return this;
        }

        public Builder user(UserSummaryResponse user) {
            this.user = user;
            return this;
        }

        public LoginResponse build() {
            return new LoginResponse(accessToken, refreshToken, tokenType, expiresIn, user);
        }
    }
}
