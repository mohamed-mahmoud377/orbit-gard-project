package com.orbitgard.service;

import com.orbitgard.paymob.PaymobWebhookPayload;

public interface PaymentConfirmationService {

    void reconcileFromWebhook(PaymobWebhookPayload payload);
}