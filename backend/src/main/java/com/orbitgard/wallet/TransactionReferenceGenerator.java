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
    private static final DateTimeFormatter REFERENCE_TIMESTAMP = DateTimeFormatter
            .ofPattern("yyyyMMddHHmmssSSS")
            .withZone(ZoneOffset.UTC);

    private final WalletTransactionRepository walletTransactionRepository;

    public TransactionReferenceGenerator(WalletTransactionRepository walletTransactionRepository) {
        this.walletTransactionRepository = walletTransactionRepository;
    }

    /** Returns a 32-character reference suitable for user support lookup. */
    public String generate() {
        for (int attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            String reference = "TXN-" + REFERENCE_TIMESTAMP.format(Instant.now())
                    + "-" + String.format(Locale.ROOT, "%06d", RANDOM.nextInt(1_000_000));
            if (!walletTransactionRepository.existsByReference(reference)) {
                return reference;
            }
        }
        throw new IllegalStateException("Unable to generate a unique transaction reference");
    }

}
