package com.orbitgard.wallet;

import com.orbitgard.repository.WalletTransactionRepository;
import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.UUID;

@Component
public class TransactionReferenceGenerator {

    private static final int MAX_ATTEMPTS = 5;
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final DateTimeFormatter PUBLIC_ID_TIMESTAMP = DateTimeFormatter
            .ofPattern("yyyyMMddHHmmssSSS")
            .withZone(ZoneOffset.UTC);

    private final WalletTransactionRepository walletTransactionRepository;

    public TransactionReferenceGenerator(WalletTransactionRepository walletTransactionRepository) {
        this.walletTransactionRepository = walletTransactionRepository;
    }

    /** Returns a 32-character reference suitable for user support lookup. */
    public String generate() {
        for (int attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            String reference = UUID.randomUUID().toString().replace("-", "");
            if (!walletTransactionRepository.existsByReference(reference)) {
                return reference;
            }
        }
        throw new IllegalStateException("Unable to generate a unique transaction reference");
    }

    /** A user-facing ID with a UTC timestamp followed by six random digits. */
    public String generatePublicId() {
        for (int attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            String publicId = "TXN-" + PUBLIC_ID_TIMESTAMP.format(Instant.now())
                    + "-" + String.format(Locale.ROOT, "%06d", RANDOM.nextInt(1_000_000));
            if (!walletTransactionRepository.existsByTransactionPublicId(publicId)) {
                return publicId;
            }
        }
        throw new IllegalStateException("Unable to generate a unique public transaction ID");
    }
}
