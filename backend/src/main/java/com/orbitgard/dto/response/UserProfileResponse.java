package com.orbitgard.dto.response;

public record UserProfileResponse(
        String firstname,
        String lastname,
        String username,
        String role
) {
}
