package com.orbitgard.service;

import com.orbitgard.dto.request.RecordTransactionRequest;
import com.orbitgard.entity.WalletTransaction;

import java.util.UUID;

public interface WalletTransactionService {

    WalletTransaction record(RecordTransactionRequest request);

    WalletTransaction recordPromoCredit(UUID walletId, long amountCents);

    WalletTransaction recordTopUpCredit(UUID walletId, long amountCents, UUID paymentId);

    WalletTransaction completePendingCredit(UUID transactionId);
}
