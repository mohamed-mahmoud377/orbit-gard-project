package com.orbitgard.service.Impl;

import com.orbitgard.dto.request.RecordTransactionRequest;
import com.orbitgard.dto.response.WalletBalanceResponse;
import com.orbitgard.dto.response.WalletTransactionResponse;
import com.orbitgard.entity.Wallet;
import com.orbitgard.entity.WalletTransaction;
import com.orbitgard.mapper.WalletMapper;
import com.orbitgard.repository.WalletRepository;
import com.orbitgard.repository.WalletTransactionRepository;
import com.orbitgard.service.WalletService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

@Service
public class WalletServiceImpl implements WalletService {

    private final WalletRepository walletRepository;
    private final WalletTransactionRepository walletTransactionRepository;
    private final WalletMapper walletMapper;

    public WalletServiceImpl(WalletRepository walletRepository,
                             WalletTransactionRepository walletTransactionRepository,
                             WalletMapper walletMapper) {
        this.walletRepository = walletRepository;
        this.walletTransactionRepository = walletTransactionRepository;
        this.walletMapper = walletMapper;
    }

    @Override
    @Transactional
    public Wallet createForUser(UUID userId) {
        return walletRepository.save(Wallet.builder()
                .userId(userId)
                .balanceCents(0)
                .heldCents(0)
                .build());
    }

    @Override
    @Transactional(readOnly = true)
    public Wallet requireByUserId(UUID userId) {
        return walletRepository.findByUserId(userId)
                .orElseThrow(() -> new NoSuchElementException("Wallet not found for user: " + userId));
    }

    @Override
    @Transactional(readOnly = true)
    public WalletBalanceResponse getBalanceForUser(UUID userId) {
        return walletMapper.toBalanceResponse(requireByUserId(userId));
    }

    @Override
    @Transactional(readOnly = true)
    public List<WalletTransactionResponse> listTransactionsForUser(UUID userId) {
        Wallet wallet = requireByUserId(userId);
        return walletTransactionRepository.findByWalletIdOrderByCreatedAtAsc(wallet.getId()).stream()
                .map(walletMapper::toTransactionResponse)
                .toList();
    }
}
