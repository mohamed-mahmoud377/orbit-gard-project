package com.orbitgard.service.Impl;

import com.orbitgard.entity.Payment;
import com.orbitgard.entity.Wallet;
import com.orbitgard.entity.WalletTransaction;
import com.orbitgard.enums.PaymentStatus;
import com.orbitgard.enums.WalletTransactionType;
import com.orbitgard.exceptions.ApiException;
import com.orbitgard.exceptions.ErrorCode;
import com.orbitgard.paymob.PaymobClient;
import com.orbitgard.dto.response.PaymobTransactionInquiryResponse;
import com.orbitgard.repository.PaymentRepository;
import com.orbitgard.repository.WalletRepository;
import com.orbitgard.repository.WalletTransactionRepository;
import com.orbitgard.service.PaymentConfirmationService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@Service
@Slf4j
public class PaymentConfirmationServiceImpl implements PaymentConfirmationService {

    private static final List<PaymentStatus> PENDING_STATUSES =
            List.of(PaymentStatus.STARTED, PaymentStatus.AWAITING_CONFIRMATION);

    private final PaymentRepository paymentRepository;
    private final WalletRepository walletRepository;
    private final WalletTransactionRepository walletTransactionRepository;
    private final PaymobClient paymobClient;

    public PaymentConfirmationServiceImpl(PaymentRepository paymentRepository, WalletRepository walletRepository,
                                          WalletTransactionRepository walletTransactionRepository,
                                          PaymobClient paymobClient) {
        this.paymentRepository = paymentRepository;
        this.walletRepository = walletRepository;
        this.walletTransactionRepository = walletTransactionRepository;
        this.paymobClient = paymobClient;
    }

    @Override
    public void reconcile(UUID paymentId) {
        Payment payment = paymentRepository.findById(paymentId)
                .orElseThrow(() -> new ApiException(ErrorCode.PAYMENT_NOT_FOUND));

        if (!PENDING_STATUSES.contains(payment.getStatus())) {
            return;
        }

        String bearerToken;
        PaymobTransactionInquiryResponse inquiry;
        try {
            bearerToken = paymobClient.getAuthToken().getToken();
            inquiry = paymobClient.inquireTransaction(paymentId.toString(), bearerToken);
        } catch (Exception ex) {
            log.warn("Paymob unreachable while reconciling payment {}", paymentId, ex);
            return;
        }

        if (inquiry.isPending()) {
            return;
        }

        if (inquiry.isRefunded() || !inquiry.isSuccess() || inquiry.isVoided() || inquiry.isErrorOccured()) {
            markFailed(payment, "Paymob reported the transaction did not succeed");
            return;
        }

        if (!settledAmountMatches(payment, inquiry)) {
            log.error("Settled amount/currency mismatch for payment {}: expected {} {}, got {} cents {}",
                    paymentId, payment.getAmountCents(), payment.getCurrency(),
                    inquiry.getAmountCents(), inquiry.getCurrency());
            markFailed(payment, "Settled amount or currency did not match the requested amount");
            return;
        }

        complete(payment);
    }

    @Transactional
    protected void complete(Payment payment) {
        int updated = paymentRepository.updateStatusIfCurrentlyIn(
                payment.getId(), PENDING_STATUSES, PaymentStatus.COMPLETED);
        if (updated == 0) {
            return;
        }

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
    protected void markFailed(Payment payment, String reason) {
        int updated = paymentRepository.updateStatusIfCurrentlyIn(
                payment.getId(), PENDING_STATUSES, PaymentStatus.FAILED);
        if (updated > 0) {
            payment.setFailureReason(reason);
            paymentRepository.save(payment);
        }
    }

    private void ensureWalletExists(UUID userId) {
        if (walletRepository.findByUserId(userId).isEmpty()) {
            walletRepository.save(Wallet.builder().userId(userId).balanceCents(0).build());
        }
    }

    private boolean settledAmountMatches(Payment payment, PaymobTransactionInquiryResponse inquiry) {
        if (inquiry.getAmountCents() == null || inquiry.getCurrency() == null) {
            return false;
        }
        return payment.getAmountCents() == inquiry.getAmountCents()
                && payment.getCurrency().equalsIgnoreCase(inquiry.getCurrency());
    }
}