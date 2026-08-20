package com.orbitgard.instapay;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Turning what was printed on a receipt into cents.
 *
 * Two different jobs live here and they have deliberately different
 * strictness.
 *
 * parseCents reads the normalised fields — amount, fees, totalAmount. The
 * system instruction asks for plain decimal strings and ReceiptExtraction's
 * @Pattern already refuses anything else, so anything that reaches here and
 * still does not parse is a genuine problem and comes back empty.
 *
 * parseAsShownCents reads amountAsShown, which is the literal pixels: "1
 * EGP", "EGP 1,500.00", "١٥٠٠٫٠٠ ج.م". It is lenient by design, because its
 * only purpose is a free sanity check against the normalised value. A
 * string it cannot make sense of produces empty, and empty means "no
 * opinion" — never a rejection. Rejecting real money because a bank
 * formatted its currency symbol in a way this method did not anticipate
 * would be a worse failure than skipping the check.
 */
public final class ReceiptAmounts {

    /** The same shape ReceiptExtraction's @Pattern enforces. */
    private static final Pattern PLAIN_DECIMAL = Pattern.compile("^\\d{1,13}(\\.\\d{1,2})?$");

    /** The first number in a free-form string, after digit normalisation. */
    private static final Pattern FIRST_NUMBER = Pattern.compile("\\d+(?:\\.\\d+)?");

    /** Arabic-Indic ٠-٩ and the Persian/Urdu extended set ۰-۹. */
    private static final char ARABIC_INDIC_ZERO = '\u0660';
    private static final char ARABIC_INDIC_NINE = '\u0669';
    private static final char EXTENDED_ARABIC_INDIC_ZERO = '\u06F0';
    private static final char EXTENDED_ARABIC_INDIC_NINE = '\u06F9';

    /** ٫ — the Arabic decimal separator, which is not a full stop. */
    private static final char ARABIC_DECIMAL_SEPARATOR = '\u066B';

    /** ٬ — the Arabic thousands separator. */
    private static final char ARABIC_THOUSANDS_SEPARATOR = '\u066C';

    private ReceiptAmounts() {
    }

    /**
     * Reads one of the normalised decimal fields.
     *
     * @return the value in cents, or empty when the string is absent or is
     *         not the plain decimal the prompt asked for
     */
    public static Optional<Long> parseCents(String plainDecimal) {
        if (plainDecimal == null || plainDecimal.isBlank()) {
            return Optional.empty();
        }

        String trimmed = plainDecimal.trim();
        if (!PLAIN_DECIMAL.matcher(trimmed).matches()) {
            return Optional.empty();
        }

        try {
            // UNNECESSARY is safe: the pattern above caps the scale at 2,
            // so nothing that gets here can need rounding. If that ever
            // stops being true the exception is the right outcome — it
            // means the two are out of step.
            return Optional.of(new BigDecimal(trimmed)
                    .setScale(2, RoundingMode.UNNECESSARY)
                    .movePointRight(2)
                    .longValueExact());
        } catch (ArithmeticException | NumberFormatException e) {
            return Optional.empty();
        }
    }

    /**
     * Reads the amount as it was literally printed, for cross-checking only.
     *
     * @return the value in cents, or empty when there is no number in there
     *         at all — which means "cannot check", not "does not match"
     */
    public static Optional<Long> parseAsShownCents(String amountAsShown) {
        if (amountAsShown == null || amountAsShown.isBlank()) {
            return Optional.empty();
        }

        String normalised = stripGrouping(toWesternDigits(amountAsShown));

        Matcher matcher = FIRST_NUMBER.matcher(normalised);
        if (!matcher.find()) {
            return Optional.empty();
        }

        try {
            // HALF_UP rather than UNNECESSARY: this is untrusted formatting
            // from a photograph, and a third decimal place should weaken the
            // check rather than throw inside it.
            return Optional.of(new BigDecimal(matcher.group())
                    .setScale(2, RoundingMode.HALF_UP)
                    .movePointRight(2)
                    .longValueExact());
        } catch (ArithmeticException | NumberFormatException e) {
            return Optional.empty();
        }
    }

    /**
     * Converts Arabic-Indic and extended Arabic-Indic digits to Western
     * ones, and the Arabic decimal separator to a full stop.
     *
     * Egyptian bank apps render in Arabic often enough that this happens in
     * the first week of real use. The prompt already asks the model to
     * convert digits in the numeric fields, but amountAsShown is explicitly
     * exempt from that — it is supposed to arrive unnormalised — so the
     * conversion has to exist here too.
     */
    static String toWesternDigits(String raw) {
        StringBuilder out = new StringBuilder(raw.length());
        for (char c : raw.toCharArray()) {
            if (c >= ARABIC_INDIC_ZERO && c <= ARABIC_INDIC_NINE) {
                out.append((char) ('0' + (c - ARABIC_INDIC_ZERO)));
            } else if (c >= EXTENDED_ARABIC_INDIC_ZERO && c <= EXTENDED_ARABIC_INDIC_NINE) {
                out.append((char) ('0' + (c - EXTENDED_ARABIC_INDIC_ZERO)));
            } else if (c == ARABIC_DECIMAL_SEPARATOR) {
                out.append('.');
            } else {
                out.append(c);
            }
        }
        return out.toString();
    }

    /**
     * Removes thousands separators so "1,500.00" reads as one number.
     *
     * A space is only removed when it sits between two digits. Some Arabic
     * renderings group with a space rather than a comma, and without this
     * "1 500.00" would read as the number 1 and then fail a cross-check
     * against a perfectly good receipt. A space anywhere else — "1500.00
     * EGP" — is left alone, because it is a real separator between the
     * number and the currency and removing it would glue them together.
     */
    private static String stripGrouping(String value) {
        StringBuilder out = new StringBuilder(value.length());
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);

            if (c == ',' || c == ARABIC_THOUSANDS_SEPARATOR) {
                continue;
            }

            if (isSpace(c)
                    && i > 0 && Character.isDigit(value.charAt(i - 1))
                    && i + 1 < value.length() && Character.isDigit(value.charAt(i + 1))) {
                continue;
            }

            out.append(c);
        }
        return out.toString();
    }

    private static boolean isSpace(char c) {
        return c == ' ' || c == '\u00A0' || c == '\u202F' || c == '\u2009';
    }
}
