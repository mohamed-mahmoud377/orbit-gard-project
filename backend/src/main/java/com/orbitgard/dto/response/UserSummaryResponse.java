package com.orbitgard.dto.response;

import com.orbitgard.enums.AccountType;

import java.util.UUID;

public record UserSummaryResponse(
        UUID id,
        String username,
        String firstName,
        String lastName,
        AccountType accountType
) {
    public static Builder builder() {
        return new Builder();
    }

    public static final class Builder {
        private UUID id;
        private String username;
        private String firstName;
        private String lastName;
        private AccountType accountType;

        public Builder id(UUID id) {
            this.id = id;
            return this;
        }

        public Builder username(String username) {
            this.username = username;
            return this;
        }

        public Builder firstName(String firstName) {
            this.firstName = firstName;
            return this;
        }

        public Builder lastName(String lastName) {
            this.lastName = lastName;
            return this;
        }

        public Builder accountType(AccountType accountType) {
            this.accountType = accountType;
            return this;
        }

        public UserSummaryResponse build() {
            return new UserSummaryResponse(id, username, firstName, lastName, accountType);
        }
    }
}
