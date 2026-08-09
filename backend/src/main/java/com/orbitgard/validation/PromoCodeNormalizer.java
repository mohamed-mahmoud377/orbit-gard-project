package com.orbitgard.validation;

import java.util.Locale;

/**
 * Normalizes promotional codes for storage and lookup. Codes are compared
 * case-insensitively and stored in uppercase.
 */
public final class PromoCodeNormalizer {

    private PromoCodeNormalizer() {
    }

    public static String normalize(String rawInput) {
        if (rawInput == null) {
            return null;
        }
        return rawInput.trim().toUpperCase(Locale.ROOT);
    }

    public static String normalizeOrNull(String rawInput) {
        if (rawInput == null || rawInput.isBlank()) {
            return null;
        }
        return normalize(rawInput);
    }
}
