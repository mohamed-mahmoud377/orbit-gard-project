package com.orbitgard.service.Impl;

import com.orbitgard.entity.Payment;
import com.orbitgard.entity.Wallet;
import com.orbitgard.enums.PaymentStatus;
import com.orbitgard.repository.PaymentRepository;
import com.orbitgard.service.WalletService;
import com.orbitgard.service.WalletTransactionService;
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
    private final WalletService walletService;
    private final WalletTransactionService walletTransactionService;

    public PaymentTransitionService(PaymentRepository paymentRepository,
                                    WalletService walletService,
                                    WalletTransactionService walletTransactionService) {
        this.paymentRepository = paymentRepository;
        this.walletService = walletService;
        this.walletTransactionService = walletTransactionService;
    }

    @Transactional
    public void complete(Payment payment) {
        int updated = paymentRepository.updateStatusIfCurrentlyIn(
                payment.getId(), PENDING_STATUSES, PaymentStatus.COMPLETED);
        if (updated == 0) return;

        UUID userId = payment.getUser().getId();
        Wallet wallet = walletService.requireByUserId(userId);

        walletTransactionService.recordTopUpCredit(
                wallet.getId(),
                payment.getAmountCents(),
                payment.getId());
    }

    @Transactional
    public void markFailed(Payment payment, String reason) {
        int updated = paymentRepository.updateStatusIfCurrentlyIn(
                payment.getId(), PENDING_STATUSES, PaymentStatus.FAILED);
        if (updated > 0) {
            // The bulk update above bypasses the persistence context, so this
            // instance still carries its old pending status. Saving it without
            // realigning the status would merge that stale value straight back
            // over the FAILED the update just wrote.
            payment.setStatus(PaymentStatus.FAILED);
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
}
