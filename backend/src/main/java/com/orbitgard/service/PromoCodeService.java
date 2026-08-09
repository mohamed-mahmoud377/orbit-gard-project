package com.orbitgard.service;

import com.orbitgard.dto.response.PromoCodeValidationResponse;
import com.orbitgard.entity.PromoCode;

import java.util.Optional;
import java.util.UUID;

public interface PromoCodeService {

    PromoCodeValidationResponse validateCode(String code);

    Optional<PromoCode> findValidPromo(String code);

    void applyPromoToWallet(PromoCode promo, UUID userId);

    void applyAtSignup(UUID walletId, String code);
}
