package com.orbitgard.service;

import java.util.Optional;
import java.util.UUID;

public interface PromoCodeService {

    /** Returns the credit amount in cents when the code is valid, otherwise empty. */
    Optional<Long> resolveAmountCents(String promoCode);

    void applyAtSignup(UUID walletId, String promoCodeEntered);
}
