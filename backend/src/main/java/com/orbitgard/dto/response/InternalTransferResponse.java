package com.orbitgard.dto.response;

import java.util.UUID;

public record InternalTransferResponse(
        UUID debitTransactionId,
        String debitReference,
        UUID creditTransactionId,
        String creditReference,
        String creditStatus
) {}