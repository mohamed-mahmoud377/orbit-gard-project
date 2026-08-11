package com.orbitgard.scheduler;

import com.orbitgard.entity.Payment;
import com.orbitgard.enums.PaymentStatus;
import com.orbitgard.repository.PaymentRepository;
import com.orbitgard.service.PaymentTransitionService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

@Component
@Slf4j
public class PaymentReconciliationJob {

    private static final List<PaymentStatus> STUCK_STATUSES =
            List.of(PaymentStatus.STARTED, PaymentStatus.AWAITING_CONFIRMATION);

    private final PaymentRepository paymentRepository;
    private final PaymentTransitionService transitionService;

    public PaymentReconciliationJob(PaymentRepository paymentRepository,
                                    PaymentTransitionService transitionService) {
        this.paymentRepository = paymentRepository;
        this.transitionService = transitionService;
    }

    @Scheduled(fixedRate = 3, timeUnit = java.util.concurrent.TimeUnit.HOURS)
    public void reconcileStuckPayments() {
        OffsetDateTime cutoff = OffsetDateTime.now(ZoneOffset.UTC).minusHours(1);
        List<Payment> stuck = paymentRepository.findByStatusInAndCreatedAtBefore(STUCK_STATUSES, cutoff);

        log.info("Payment reconciliation job: found {} stuck payment(s) older than 1 hour", stuck.size());

        for (Payment payment : stuck) {
            try {
                transitionService.cancelIfStillPending(payment.getId());
            } catch (Exception ex) {
                log.error("Cancellation failed for payment {}", payment.getId(), ex);
            }
        }
    }
}