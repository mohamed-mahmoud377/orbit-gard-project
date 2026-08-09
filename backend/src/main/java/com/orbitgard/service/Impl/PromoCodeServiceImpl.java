package com.orbitgard.service.Impl;

import com.orbitgard.dto.response.PromoCodeValidationResponse;
import com.orbitgard.entity.PromoCode;
import com.orbitgard.enums.PromoCodeValidationStatus;
import com.orbitgard.repository.PromoCodeRepository;
import com.orbitgard.repository.WalletRepository;
import com.orbitgard.service.PromoCodeService;
import com.orbitgard.validation.PromoCodeNormalizer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

@Service
public class PromoCodeServiceImpl implements PromoCodeService {

    private static final Logger log = LoggerFactory.getLogger(PromoCodeServiceImpl.class);
    private static final long CENTS_PER_EGP = 100L;

    private final PromoCodeRepository promoCodeRepository;
    private final WalletRepository walletRepository;

    public PromoCodeServiceImpl(PromoCodeRepository promoCodeRepository, WalletRepository walletRepository) {
        this.promoCodeRepository = promoCodeRepository;
        this.walletRepository = walletRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public PromoCodeValidationResponse validateCode(String code) {
        return toValidationResponse(lookupPromo(code));
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<PromoCode> findValidPromo(String code) {
        PromoLookupResult result = lookupPromo(code);
        if (result.status() == PromoCodeValidationStatus.VALID) {
            return Optional.of(result.promo());
        }
        return Optional.empty();
    }

    @Override
    @Transactional
    public void applyPromoToWallet(PromoCode promo, UUID userId) {
        int updated = walletRepository.credit(userId, promo.getRewardAmountCents());
        if (updated == 0) {
            log.warn("Promo credit skipped because wallet was not found. userId={}, code={}", userId, promo.getCode());
            return;
        }

        // TODO (ORB-XXX):
        // Persist a Transaction record representing this promotional bonus.
        // This should become the first transaction visible in the user's
        // transaction history once the Transaction module is implemented.

        log.info(
                "Promotional bonus credited. userId={}, code={}, amountCents={}",
                userId,
                promo.getCode(),
                promo.getRewardAmountCents());
    }

    private PromoLookupResult lookupPromo(String rawCode) {
        String normalized = PromoCodeNormalizer.normalizeOrNull(rawCode);
        if (normalized == null) {
            return PromoLookupResult.invalid();
        }

        Optional<PromoCode> promo = promoCodeRepository.findByCodeIgnoreCase(normalized);
        if (promo.isEmpty()) {
            return PromoLookupResult.invalid();
        }

        PromoCode found = promo.get();
        if (isExpired(found)) {
            return PromoLookupResult.expired(found);
        }

        return PromoLookupResult.valid(found);
    }

    private boolean isExpired(PromoCode promo) {
        return !promo.getExpiresAt().isAfter(OffsetDateTime.now());
    }

    private PromoCodeValidationResponse toValidationResponse(PromoLookupResult result) {
        return switch (result.status()) {
            case VALID -> PromoCodeValidationResponse.builder()
                    .status(PromoCodeValidationStatus.VALID)
                    .amount(result.promo().getRewardAmountCents() / CENTS_PER_EGP)
                    .build();
            case EXPIRED -> PromoCodeValidationResponse.builder()
                    .status(PromoCodeValidationStatus.EXPIRED)
                    .build();
            case INVALID -> PromoCodeValidationResponse.builder()
                    .status(PromoCodeValidationStatus.INVALID)
                    .build();
        };
    }

    private record PromoLookupResult(PromoCodeValidationStatus status, PromoCode promo) {

        static PromoLookupResult valid(PromoCode promo) {
            return new PromoLookupResult(PromoCodeValidationStatus.VALID, promo);
        }

        static PromoLookupResult invalid() {
            return new PromoLookupResult(PromoCodeValidationStatus.INVALID, null);
        }

        static PromoLookupResult expired(PromoCode promo) {
            return new PromoLookupResult(PromoCodeValidationStatus.EXPIRED, promo);
        }
    }
}
