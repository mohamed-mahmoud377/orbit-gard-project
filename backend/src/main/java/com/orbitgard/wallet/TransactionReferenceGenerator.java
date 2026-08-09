package com.orbitgard.wallet;

import com.orbitgard.repository.WalletTransactionRepository;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
public class TransactionReferenceGenerator {

    private static final int MAX_ATTEMPTS = 5;

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
}
