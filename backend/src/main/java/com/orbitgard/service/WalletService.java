package com.orbitgard.service;

import com.orbitgard.dto.response.WalletBalanceResponse;
import com.orbitgard.dto.response.WalletTransactionResponse;
import com.orbitgard.entity.Wallet;

import java.util.List;
import java.util.UUID;

public interface WalletService {

    Wallet createForUser(UUID userId);

    Wallet requireByUserId(UUID userId);

    WalletBalanceResponse getBalanceForUser(UUID userId);

    List<WalletTransactionResponse> listTransactionsForUser(UUID userId);
}
