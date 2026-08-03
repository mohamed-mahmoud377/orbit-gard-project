package com.orbitgard.service;

import java.util.UUID;

public interface PaymentConfirmationService {

    /**
     * The single authoritative path. Callable from the webhook, the browser
     * return, and the reconciliation job alike — all three just need to know
     * "which payment changed," then call this to find out what's actually
     * true, via Paymob's own inquiry API, never by trusting whatever they
     * were told.
     */
    void reconcile(UUID paymentId);
}