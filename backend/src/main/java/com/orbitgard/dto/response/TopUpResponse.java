package com.orbitgard.dto.response;

import java.util.UUID;

public record TopUpResponse(
        UUID paymentId,
        String redirectUrl
) {
}
