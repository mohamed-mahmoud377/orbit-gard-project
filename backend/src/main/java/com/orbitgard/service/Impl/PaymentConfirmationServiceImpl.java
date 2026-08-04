package com.orbitgard.service.Impl;

import com.orbitgard.entity.Payment;
import com.orbitgard.enums.PaymentStatus;
import com.orbitgard.exceptions.ApiException;
import com.orbitgard.exceptions.ErrorCode;
import com.orbitgard.paymob.PaymobClient;
import com.orbitgard.dto.response.PaymobIntentionStatusResponse;
import com.orbitgard.repository.PaymentRepository;
import com.orbitgard.service.PaymentConfirmationService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
@Slf4j
public class PaymentConfirmationServiceImpl implements PaymentConfirmationService {

    private static final List<PaymentStatus> PENDING_STATUSES =
            List.of(PaymentStatus.STARTED, PaymentStatus.AWAITING_CONFIRMATION);

    // TODO verify these against a real completed test payment in Postman —
    // this endpoint's status vocabulary hasn't been confirmed yet.
    private static final Set<String> SUCCESS_STATUSES = Set.of("paid", "successful", "success");
    private static final Set<String> FAILURE_STATUSES = Set.of("failed", "declined", "expired", "voided");

    private final PaymentRepository paymentRepository;
    private final PaymobClient paymobClient;
    private final PaymentTransitionService transitionService;

    public PaymentConfirmationServiceImpl(PaymentRepository paymentRepository, PaymobClient paymobClient,
                                          PaymentTransitionService transitionService) {
        this.paymentRepository = paymentRepository;
        this.paymobClient = paymobClient;
        this.transitionService = transitionService;
    }

    @Override
    public void reconcile(UUID paymentId) {
        Payment payment = paymentRepository.findById(paymentId)
                .orElseThrow(() -> new ApiException(ErrorCode.PAYMENT_NOT_FOUND));

        if (!PENDING_STATUSES.contains(payment.getStatus())) {
            return;
        }
        if (payment.getPaymobClientSecret() == null) {
            log.warn("Payment {} has no Paymob client_secret yet, skipping reconcile", paymentId);
            return;
        }

        PaymobIntentionStatusResponse status;
        try {
            status = paymobClient.getIntentionStatus(payment.getPaymobClientSecret());
        } catch (Exception ex) {
            log.warn("Paymob unreachable while reconciling payment {}", paymentId, ex);
            return;
        }

        String s = status.getStatus() == null ? "" : status.getStatus().toLowerCase();

        if (SUCCESS_STATUSES.contains(s)) {
            if (!settledAmountMatches(payment, status)) {
                log.error("Settled amount mismatch for payment {}: expected {} cents, got {}",
                        paymentId, payment.getAmountCents(), status.getAmount());
                transitionService.markFailed(payment, "Settled amount did not match the requested amount");
                return;
            }
            transitionService.complete(payment);
        } else if (FAILURE_STATUSES.contains(s)) {
            transitionService.markFailed(payment, "Paymob reported status: " + s);
        }
        // anything else (e.g. "intended", "pending") — leave as-is, check again later
    }

    private boolean settledAmountMatches(Payment payment, PaymobIntentionStatusResponse status) {
        if (status.getAmount() == null) return false;
        return payment.getAmountCents() == status.getAmount();
    }
}