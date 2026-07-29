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
}
