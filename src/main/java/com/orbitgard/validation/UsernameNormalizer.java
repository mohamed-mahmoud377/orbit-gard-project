package com.orbitgard.validation;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Normalizes and validates usernames, in the order the API contract
 * requires: trim and lowercase FIRST, then test the format — since
 * "Omar" and "omar" must be treated as the same username, and the
 * uniqueness index is built on the lowercased, stored value.
 */
public final class UsernameNormalizer {

    private static final Pattern USERNAME_PATTERN = Pattern.compile("^[a-z0-9._-]{3,30}$");

    private UsernameNormalizer() {
    }

    /**
     * Trims and lowercases. Cheap, no database call — safe to run on
     * every keystroke of a debounced availability check.
     */
    public static String normalize(String rawInput) {
        if (rawInput == null) {
            return null;
        }
        return rawInput.trim().toLowerCase(Locale.ROOT);
    }

    /**
     * Call this only on an already-normalized value (see normalize above).
     * 3-30 characters: lowercase letters, digits, dot, underscore, hyphen.
     */
    public static boolean isValidFormat(String normalizedUsername) {
        return normalizedUsername != null && USERNAME_PATTERN.matcher(normalizedUsername).matches();
    }
}
