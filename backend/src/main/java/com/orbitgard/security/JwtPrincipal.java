package com.orbitgard.security;

import com.orbitgard.enums.AccountType;

import java.util.UUID;

public record JwtPrincipal(UUID userId, String username, AccountType accountType, UUID sessionId) {
}
