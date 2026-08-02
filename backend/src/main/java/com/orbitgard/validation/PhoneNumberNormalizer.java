package com.orbitgard.validation;

import java.util.regex.Pattern;

/**
 * Normalizes a phone number the user typed into the canonical form
 * stored in users.phone_number: "+20" followed by 9 digits starting
 * 10, 11, 12 or 15.
 *
 * Accepts exactly the four input formats the story lists:
 *   01012345678, +201012345678, 00201012345678, 1012345678
 * (the last one assumes the +20 was already shown on the form, so the
 * user only types the 10-digit local part).
 *
 * Normalise before you check. Two different raw strings that mean the
 * same real number (01012345678 and +201012345678) must normalize to
 * the identical canonical value, or uniqueness checks will let the
 * same phone register twice.
 */
public final class PhoneNumberNormalizer {

    // Local Egyptian mobile number, no leading 0: prefix + 8 digits = 10 chars total.
    private static final Pattern EGYPT_MOBILE_LOCAL = Pattern.compile("^(10|11|12|15)\\d{8}$");

    private PhoneNumberNormalizer() {
    }

    public enum Status {
        VALID,
        // Not recognisable as a phone number at all, or a recognisable
        // Egyptian number that isn't a mobile (e.g. a landline).
        INVALID,
        // Looks like a real international number, just not +20.
        NOT_EGYPTIAN
    }

    public record Result(Status status, String canonicalNumber) {

        public static Result valid(String canonicalNumber) {
            return new Result(Status.VALID, canonicalNumber);
        }

        public static Result invalid() {
            return new Result(Status.INVALID, null);
        }

        public static Result notEgyptian() {
            return new Result(Status.NOT_EGYPTIAN, null);
        }

        public boolean isValid() {
            return status == Status.VALID;
        }
    }

    public static Result normalize(String rawInput) {
        if (rawInput == null) {
            return Result.invalid();
        }

        String trimmed = rawInput.trim().replaceAll("[\\s-]", "");
        if (trimmed.isEmpty()) {
            return Result.invalid();
        }

        String local;

        if (trimmed.startsWith("+20")) {
            local = trimmed.substring(3);
        } else if (trimmed.startsWith("0020")) {
            local = trimmed.substring(4);
        } else if (trimmed.startsWith("0") && trimmed.length() == 11) {
            // 01012345678 -> drop the leading 0
            local = trimmed.substring(1);
        } else if (trimmed.length() == 10 && EGYPT_MOBILE_LOCAL.matcher(trimmed).matches()) {
            // 1012345678 -> already the local part, +20 shown on the form
            local = trimmed;
        } else if (trimmed.startsWith("+")) {
            // Has an international prefix, just not +20.
            // Note: a bare "00" prefix for a non-Egyptian country code
            // (e.g. 0044...) isn't distinguishable from a malformed
            // local number with this input set, so it falls through
            // to INVALID rather than NOT_EGYPTIAN.
            return Result.notEgyptian();
        } else {
            return Result.invalid();
        }

        if (!EGYPT_MOBILE_LOCAL.matcher(local).matches()) {
            // Right shape to be Egyptian (11 digits starting 0, or the
            // +20/0020 form) but the local part isn't a mobile prefix —
            // e.g. a landline like 0221234567.
            return Result.invalid();
        }

        return Result.valid("+20" + local);
    }
}
