package com.orbitgard.dto.response;

/**
 * 200 OK body for GET /api/v1/auth/username-available.
 *
 * Always 200, even for a malformed username — a user mid-word has not
 * made an error. reason distinguishes the three states the UI shows:
 * null (free), "TAKEN", or "INVALID".
 */
public record UsernameAvailabilityResponse(
        String username,
        boolean available,
        String reason
) {
    public static Builder builder() {
        return new Builder();
    }

    public static final class Builder {
        private String username;
        private boolean available;
        private String reason;

        public Builder username(String username) {
            this.username = username;
            return this;
        }

        public Builder available(boolean available) {
            this.available = available;
            return this;
        }

        public Builder reason(String reason) {
            this.reason = reason;
            return this;
        }

        public UsernameAvailabilityResponse build() {
            return new UsernameAvailabilityResponse(username, available, reason);
        }
    }
}
