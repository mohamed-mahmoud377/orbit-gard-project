package com.orbitgard.service.Impl;

import com.orbitgard.service.PromoCodeService;
import com.orbitgard.service.WalletTransactionService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Minimal promo lookup for ORB-011 acceptance (welcome500). Full validation lives in ORB-005.
 */
@Service
public class PromoCodeServiceImpl implements PromoCodeService {

    private static final Map<String, Long> KNOWN_PROMO_AMOUNTS_CENTS = Map.of(
            "welcome500", 50_000L
    );

    private final WalletTransactionService walletTransactionService;

    public PromoCodeServiceImpl(WalletTransactionService walletTransactionService) {
        this.walletTransactionService = walletTransactionService;
    }

    @Override
    public Optional<Long> resolveAmountCents(String promoCode) {
        if (promoCode == null || promoCode.isBlank()) {
            return Optional.empty();
        }
        Long amount = KNOWN_PROMO_AMOUNTS_CENTS.get(promoCode.trim().toLowerCase(Locale.ROOT));
        return Optional.ofNullable(amount);
    }

    @Override
    @Transactional
    public void applyAtSignup(UUID walletId, String promoCodeEntered) {
        resolveAmountCents(promoCodeEntered).ifPresent(amountCents ->
                walletTransactionService.recordPromoCredit(walletId, amountCents));
    }
}
