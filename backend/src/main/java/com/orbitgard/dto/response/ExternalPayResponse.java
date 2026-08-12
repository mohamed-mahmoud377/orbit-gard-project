package com.orbitgard.dto.response;

import com.orbitgard.enums.TransactionStatus;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

public record ExternalPayResponse(
        UUID transactionId,
        String reference,
        TransactionStatus status,
        BigDecimal cashAmount,
        String merchantName,
        String productName,
        OffsetDateTime createdAt
) {
}
