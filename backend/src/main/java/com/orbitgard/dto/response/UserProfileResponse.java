package com.orbitgard.dto.response;

/**
 * childrenCount is set for a USER only, parentFirstName for a CHILD only —
 * the other is null, matching how the two sidebars differ.
 */
public record UserProfileResponse(
        String firstname,
        String lastname,
        String username,
        String role,
        Integer childrenCount,
        String parentFirstName
) {
}