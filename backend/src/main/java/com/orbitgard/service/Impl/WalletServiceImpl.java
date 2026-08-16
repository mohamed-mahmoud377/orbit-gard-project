package com.orbitgard.service.Impl;

import com.orbitgard.dto.request.RecordTransactionRequest;
import com.orbitgard.dto.response.WalletBalanceResponse;
import com.orbitgard.dto.response.WalletTransactionPageResponse;
import com.orbitgard.dto.response.WalletTransactionSummaryResponse;
import com.orbitgard.entity.Wallet;
import com.orbitgard.entity.WalletTransaction;
import com.orbitgard.enums.TransactionDirection;
import com.orbitgard.enums.TransactionStatus;
import com.orbitgard.mapper.WalletMapper;
import com.orbitgard.repository.WalletRepository;
import com.orbitgard.repository.WalletTransactionRepository;
import com.orbitgard.service.WalletService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.NoSuchElementException;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;

@Service
public class WalletServiceImpl implements WalletService {

    private static final int TRANSACTION_PAGE_SIZE = 10;

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
    public WalletTransactionPageResponse listTransactionsForUser(UUID userId, int page) {
        Wallet wallet = requireByUserId(userId);
        var transactionPage = walletTransactionRepository.findByWalletIdOrderByCreatedAtAsc(
                wallet.getId(), PageRequest.of(page, TRANSACTION_PAGE_SIZE));

        return new WalletTransactionPageResponse(
                transactionPage.getContent().stream().map(walletMapper::toTransactionResponse).toList(),
                transactionPage.getNumber(),
                transactionPage.getSize(),
                transactionPage.getTotalElements(),
                transactionPage.getTotalPages(),
                transactionPage.isFirst(),
                transactionPage.isLast()
        );
    }

    @Override
    @Transactional(readOnly = true)
    public WalletTransactionSummaryResponse getMonthlySummaryForUser(UUID userId) {
        Wallet wallet = requireByUserId(userId);

        OffsetDateTime monthStart = YearMonth.now(ZoneOffset.UTC)
                .atDay(1)
                .atStartOfDay()
                .atOffset(ZoneOffset.UTC);
        OffsetDateTime monthEnd = monthStart.plusMonths(1);

        long moneyInCents = walletTransactionRepository.sumAmountCentsByWalletAndDirectionAndStatusAndPeriod(
                wallet.getId(), TransactionDirection.CREDIT, TransactionStatus.COMPLETED, monthStart, monthEnd);
        long moneyOutCents = walletTransactionRepository.sumAmountCentsByWalletAndDirectionAndStatusAndPeriod(
                wallet.getId(), TransactionDirection.DEBIT, TransactionStatus.COMPLETED, monthStart, monthEnd);
        long rejectedCount = walletTransactionRepository.countByWalletIdAndStatus(
                wallet.getId(), TransactionStatus.REJECTED, monthStart , monthEnd);

        BigDecimal currentlyHeld = walletMapper.toBalanceResponse(wallet).held();

        return new WalletTransactionSummaryResponse(
                BigDecimal.valueOf(moneyInCents, 2),
                BigDecimal.valueOf(moneyOutCents, 2),
                currentlyHeld,
                rejectedCount
        );
    }
}
