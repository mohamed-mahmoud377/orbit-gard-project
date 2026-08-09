package com.orbitgard.service.Impl;

import com.orbitgard.dto.request.RecordTransactionRequest;
import com.orbitgard.entity.Wallet;
import com.orbitgard.entity.WalletTransaction;
import com.orbitgard.enums.TransactionDirection;
import com.orbitgard.enums.TransactionStatus;
import com.orbitgard.enums.TransactionType;
import com.orbitgard.repository.WalletRepository;
import com.orbitgard.repository.WalletTransactionRepository;
import com.orbitgard.service.WalletTransactionService;
import com.orbitgard.wallet.TransactionReferenceGenerator;
import com.orbitgard.wallet.TransactionRules;
import jakarta.validation.Valid;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;

import java.time.OffsetDateTime;
import java.util.NoSuchElementException;
import java.util.UUID;

@Service
@Validated
public class WalletTransactionServiceImpl implements WalletTransactionService {

    private final WalletRepository walletRepository;
    private final WalletTransactionRepository walletTransactionRepository;
    private final TransactionReferenceGenerator referenceGenerator;

    public WalletTransactionServiceImpl(WalletRepository walletRepository,
                                        WalletTransactionRepository walletTransactionRepository,
                                        TransactionReferenceGenerator referenceGenerator) {
        this.walletRepository = walletRepository;
        this.walletTransactionRepository = walletTransactionRepository;
        this.referenceGenerator = referenceGenerator;
    }

    @Override
    @Transactional
    public WalletTransaction record(@Valid RecordTransactionRequest request) {
        TransactionRules.validateAmount(request.amountCents());
        TransactionRules.validateTypeDirection(request.type(), request.direction());

        Wallet wallet = walletRepository.findByIdForUpdate(request.walletId())
                .orElseThrow(() -> new NoSuchElementException("Wallet not found: " + request.walletId()));

        long balanceBefore = wallet.getBalanceCents();
        TransactionStatus status = request.direction() == TransactionDirection.CREDIT
                ? TransactionRules.initialCreditStatus(request.type(), request.amountCents())
                : TransactionRules.initialDebitStatus();

        applyBalanceChange(wallet, request.direction(), request.amountCents(), status);
        long balanceAfter = wallet.getBalanceCents();

        WalletTransaction transaction = WalletTransaction.builder()
                .walletId(wallet.getId())
                .type(request.type())
                .direction(request.direction())
                .status(status)
                .amountCents(request.amountCents())
                .balanceBeforeCents(balanceBefore)
                .balanceAfterCents(balanceAfter)
                .reference(referenceGenerator.generate())
                .counterparty(request.counterparty())
                .counterpartyWalletId(request.counterpartyWalletId())
                .relatedTransactionId(request.relatedTransactionId())
                .paymentId(request.paymentId())
                .build();

        walletRepository.save(wallet);
        return walletTransactionRepository.save(transaction);
    }

    @Override
    @Transactional
    public WalletTransaction recordPromoCredit(UUID walletId, long amountCents) {
        return record(RecordTransactionRequest.builder()
                .walletId(walletId)
                .type(TransactionType.PROMO)
                .direction(TransactionDirection.CREDIT)
                .amountCents(amountCents)
                .build());
    }

    @Override
    @Transactional
    public WalletTransaction recordTopUpCredit(UUID walletId, long amountCents, UUID paymentId) {
        return record(RecordTransactionRequest.builder()
                .walletId(walletId)
                .type(TransactionType.TOPUP)
                .direction(TransactionDirection.CREDIT)
                .amountCents(amountCents)
                .paymentId(paymentId)
                .build());
    }

    @Override
    @Transactional
    public WalletTransaction completePendingCredit(UUID transactionId) {
        WalletTransaction transaction = walletTransactionRepository.findByIdForUpdate(transactionId)
                .orElseThrow(() -> new NoSuchElementException("Transaction not found: " + transactionId));

        if (transaction.getDirection() != TransactionDirection.CREDIT) {
            throw new IllegalStateException("Only credit transactions can be cleared from pending");
        }

        Wallet wallet = walletRepository.findByIdForUpdate(transaction.getWalletId())
                .orElseThrow(() -> new NoSuchElementException("Wallet not found: " + transaction.getWalletId()));

        transaction.resolve(TransactionStatus.COMPLETED, OffsetDateTime.now());
        wallet.setHeldCents(wallet.getHeldCents() - transaction.getAmountCents());

        walletRepository.save(wallet);
        return walletTransactionRepository.save(transaction);
    }

    private void applyBalanceChange(Wallet wallet,
                                    TransactionDirection direction,
                                    long amountCents,
                                    TransactionStatus status) {
        if (direction == TransactionDirection.DEBIT) {
            if (wallet.getAvailableCents() < amountCents) {
                throw new IllegalStateException("Insufficient available balance");
            }
            wallet.setBalanceCents(wallet.getBalanceCents() - amountCents);
            return;
        }

        wallet.setBalanceCents(wallet.getBalanceCents() + amountCents);
        if (status == TransactionStatus.PENDING) {
            wallet.setHeldCents(wallet.getHeldCents() + amountCents);
        }
    }
}
