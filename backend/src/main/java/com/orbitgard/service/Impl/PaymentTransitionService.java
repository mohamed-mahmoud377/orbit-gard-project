package com.orbitgard.service.Impl;

import com.orbitgard.entity.Payment;
import com.orbitgard.entity.Wallet;
import com.orbitgard.entity.WalletTransaction;
import com.orbitgard.enums.PaymentStatus;
import com.orbitgard.enums.WalletTransactionType;
import com.orbitgard.repository.PaymentRepository;
import com.orbitgard.repository.WalletRepository;
import com.orbitgard.repository.WalletTransactionRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Component
@Slf4j
public class PaymentTransitionService {

    private static final List<PaymentStatus> PENDING_STATUSES =
            List.of(PaymentStatus.STARTED, PaymentStatus.AWAITING_CONFIRMATION);

    private final PaymentRepository paymentRepository;
    private final WalletRepository walletRepository;
    private final WalletTransactionRepository walletTransactionRepository;

    public PaymentTransitionService(PaymentRepository paymentRepository, WalletRepository walletRepository,
                                    WalletTransactionRepository walletTransactionRepository) {
        this.paymentRepository = paymentRepository;
        this.walletRepository = walletRepository;
        this.walletTransactionRepository = walletTransactionRepository;
    }

    @Transactional
    public void complete(Payment payment) {
        int updated = paymentRepository.updateStatusIfCurrentlyIn(
                payment.getId(), PENDING_STATUSES, PaymentStatus.COMPLETED);
        if (updated == 0) return;

        UUID userId = payment.getUser().getId();
        ensureWalletExists(userId);
        walletRepository.credit(userId, payment.getAmountCents());

        Wallet wallet = walletRepository.findByUserId(userId).orElseThrow();
        walletTransactionRepository.save(WalletTransaction.builder()
                .walletId(wallet.getId())
                .paymentId(payment.getId())
                .type(WalletTransactionType.TOP_UP)
                .amountCents(payment.getAmountCents())
                .build());
    }

    @Transactional
    public void markFailed(Payment payment, String reason) {
        int updated = paymentRepository.updateStatusIfCurrentlyIn(
                payment.getId(), PENDING_STATUSES, PaymentStatus.FAILED);
        if (updated > 0) {
            payment.setFailureReason(reason);
            paymentRepository.save(payment);
        }
    }

    @Transactional
    public void cancelIfStillPending(UUID paymentId) {
        int canceled = paymentRepository.updateStatusIfCurrentlyIn(
                paymentId, PENDING_STATUSES, PaymentStatus.EXPIRED);
        if (canceled > 0) {
            log.info("Payment {} canceled after being stuck for over 1 hour", paymentId);
        }
    }

    private void ensureWalletExists(UUID userId) {
        if (walletRepository.findByUserId(userId).isEmpty()) {
            walletRepository.save(Wallet.builder().userId(userId).balanceCents(0).build());
        }
    }
}