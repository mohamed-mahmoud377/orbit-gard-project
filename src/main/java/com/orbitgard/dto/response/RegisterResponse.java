package com.orbitgard.dto.response;

import com.orbitgard.enums.UserStatus;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 201 Created body for POST /api/v1/auth/register.
 *
 * Deliberately carries no tokens — the account exists but is not yet
 * active, and issuing a token here would let an unverified account
 * call the API. status is always UserStatus.PENDING_VERIFICATION at
 * this point; Jackson serialises it as "PENDING_VERIFICATION".
 */
public record RegisterResponse(
        UUID id,
        String username,
        String email,
        UserStatus status,
        OffsetDateTime createdAt
) {
    public static Builder builder() {
        return new Builder();
    }

    public static final class Builder {
        private UUID id;
        private String username;
        private String email;
        private UserStatus status;
        private OffsetDateTime createdAt;

        public Builder id(UUID id) {
            this.id = id;
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

        public Builder status(UserStatus status) {
            this.status = status;
            return this;
        }

        public Builder createdAt(OffsetDateTime createdAt) {
            this.createdAt = createdAt;
            return this;
        }

        public RegisterResponse build() {
            return new RegisterResponse(id, username, email, status, createdAt);
        }
    }
}
