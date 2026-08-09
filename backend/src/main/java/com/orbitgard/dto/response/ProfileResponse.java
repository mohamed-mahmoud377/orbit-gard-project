package com.orbitgard.dto.response;

import lombok.Builder;

@Builder
public record ProfileResponse(
        String firstName,
        String lastName,
        String username,
        String phoneNumber
) {
}
