package com.orbitgard.service;

import java.util.UUID;

public interface PaymentConfirmationService {

    void reconcileFromWebhook(UUID paymentId, boolean success, boolean pending, Integer amountCents);
}