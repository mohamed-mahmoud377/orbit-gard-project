package com.orbitgard.service;

import com.orbitgard.entity.Payment;

import java.util.UUID;

public interface PaymentTransitionService {

    void complete(Payment payment);

    void markFailed(Payment payment, String reason);

    void cancelIfStillPending(UUID paymentId);
}