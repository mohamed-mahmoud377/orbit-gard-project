package com.orbitgard.service.Impl;

import com.orbitgard.entity.Payment;
import com.orbitgard.enums.PaymentStatus;
import com.orbitgard.exceptions.ApiException;
import com.orbitgard.exceptions.ErrorCode;
import com.orbitgard.paymob.PaymobWebhookPayload;
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
    private final PaymentTransitionService transitionService;

    public PaymentConfirmationServiceImpl(PaymentRepository paymentRepository,
                                          PaymentTransitionService transitionService) {
        this.paymentRepository = paymentRepository;
        this.transitionService = transitionService;
    }

    @Override
    public void reconcileFromWebhook(PaymobWebhookPayload payload) {
        if (payload == null || payload.getObj() == null) {
            log.warn("Rejected Paymob webhook: missing obj in payload");
            return;
        }

        var obj = payload.getObj();
        String merchantOrderId = obj.getOrder() == null ? null : obj.getOrder().getMerchantOrderId();
        log.info("Webhook received: merchantOrderId={}, success={}, pending={}, amountCents={}",
                merchantOrderId, obj.isSuccess(), obj.isPending(), obj.getAmountCents());
        if (merchantOrderId == null) {
            log.warn("Paymob webhook missing merchant_order_id");
            return;
        }

        UUID paymentId;
        try {
            paymentId = UUID.fromString(merchantOrderId);
        } catch (IllegalArgumentException ex) {
            log.error("Paymob webhook returned invalid merchant_order_id={}", merchantOrderId, ex);
            return;
        }

        Payment payment = paymentRepository.findById(paymentId)
                .orElseThrow(() -> new ApiException(ErrorCode.PAYMENT_NOT_FOUND));
        log.info("Loaded payment {} with current status={}", paymentId, payment.getStatus());
        if (!PENDING_STATUSES.contains(payment.getStatus())) {
            log.info("Payment {} already in status {}, ignoring webhook", paymentId, payment.getStatus());
            return;
        }

        if (obj.isSuccess()) {
            log.info("Webhook reports success=true, checking amount: expected={}, actual={}",
                    payment.getAmountCents(), obj.getAmountCents());
            if (obj.getAmountCents() == null || payment.getAmountCents() != obj.getAmountCents()) {
                log.error("Amount mismatch for payment {}: expected {} cents, webhook said {}",
                        paymentId, payment.getAmountCents(), obj.getAmountCents());
                transitionService.markFailed(payment, "Settled amount did not match the requested amount");
                return;
            }
            log.info("Calling transitionService.complete() for payment {}", paymentId);
            transitionService.complete(payment);
        } else if (!obj.isPending()) {
            log.info("Webhook reports failure for payment {}", paymentId);
            transitionService.markFailed(payment, "Paymob webhook reported an unsuccessful transaction");
        }else {
            log.info("Webhook reports pending=true for payment {}, leaving as-is", paymentId); // ADD
        }
        // pending == true -> leave as-is, nothing to do yet
    }
}