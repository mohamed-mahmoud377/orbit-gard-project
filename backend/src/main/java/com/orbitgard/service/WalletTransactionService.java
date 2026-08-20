package com.orbitgard.service;

import com.orbitgard.dto.request.RecordTransactionRequest;
import com.orbitgard.entity.WalletTransaction;
import jakarta.validation.Valid;

import java.util.UUID;

public interface WalletTransactionService {

    WalletTransaction record(@Valid RecordTransactionRequest request);

    WalletTransaction recordPromoCredit(UUID walletId, long amountCents);

    WalletTransaction recordTopUpCredit(UUID walletId, long amountCents, UUID paymentId);

    /**
     * The InstaPay counterpart of recordTopUpCredit.
     *
     * Same kind of transaction the Paymob route produces — ORB-013 invents
     * nothing new for InstaPay — with two differences that stop it reusing
     * the method above. There is no Payment row, because no card was
     * charged and nothing was ever pending with a provider; and the
     * description has to carry the bank reference rather than the fixed
     * "Wallet top-up" string.
     *
     * @param instapayReference the reference read off the receipt, which
     *                          ends up in the description
     */
    WalletTransaction recordInstapayTopUpCredit(UUID walletId, long amountCents, String instapayReference);

    WalletTransaction completePendingCredit(UUID transactionId);

}