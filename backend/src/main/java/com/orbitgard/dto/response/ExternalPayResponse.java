package com.orbitgard.dto.response;

import com.orbitgard.enums.TransactionStatus;
import java.math.BigDecimal;
import java.time.OffsetDateTime;

public record ExternalPayResponse(
        String transactionId,
        String reference,
        TransactionStatus status,
        BigDecimal cashAmount,
        String merchantName,
        String productName,
        OffsetDateTime createdAt
) {
}
