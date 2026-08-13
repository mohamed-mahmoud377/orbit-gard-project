package com.orbitgard.service;

import com.orbitgard.dto.response.WalletBalanceResponse;
import com.orbitgard.dto.response.WalletTransactionPageResponse;
import com.orbitgard.entity.Wallet;

import java.util.UUID;

public interface WalletService {

    Wallet createForUser(UUID userId);

    Wallet requireByUserId(UUID userId);

    WalletBalanceResponse getBalanceForUser(UUID userId);

    WalletTransactionPageResponse listTransactionsForUser(UUID userId, int page);

}
