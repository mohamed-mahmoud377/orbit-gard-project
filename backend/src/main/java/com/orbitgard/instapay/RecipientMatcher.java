package com.orbitgard.instapay;

import org.springframework.stereotype.Component;

/**
 * Is this transfer addressed to Orbit?
 *
 * The phone number decides. The name cannot, and the reason is worth
 * stating plainly: real receipts print the recipient as
 * "MOHAMED M****** S*** I*****". Only the first token is legible, the rest
 * are one letter and asterisks, and there is a fourth name part that is not
 * in the configured value at all. An equals() against "Mohamed Mahmoud
 * Said" fails on every genuine receipt this will ever see.
 *
 * So the phone number is the check that carries the weight, and the name is
 * a secondary signal deliberately implemented at the loosest reading that
 * is still worth having. Anything stricter rejects real money, and the only
 * appeal route is a reviewer that Orbit does not have.
 */
@Component
public class RecipientMatcher {

    /**
     * Compared on the last ten digits: an Egyptian mobile is a ten-digit
     * subscriber number, and 01111545710, +201111545710 and 00201111545710
     * are all the same phone. PhoneNumberNormalizer is not used here on
     * purpose — it exists to canonicalise a number a user typed into a form
     * and rejects anything that is not an Egyptian mobile, whereas this is
     * comparing a string read off a photograph against configuration, where
     * "not Egyptian" is simply "not ours" rather than a validation error.
     */
    private static final int SIGNIFICANT_DIGITS = 10;

    private final InstapayProperties props;

    public RecipientMatcher(InstapayProperties props) {
        this.props = props;
    }

    /**
     * @param receiptPhone the phone exactly as read off the image, digits
     *                     only per the prompt but not trusted to be
     * @return true when it is Orbit's number
     */
    public boolean phoneMatches(String receiptPhone) {
        String fromReceipt = significantDigits(receiptPhone);
        String configured = significantDigits(props.getAccountNumber());

        if (fromReceipt == null || configured == null) {
            return false;
        }

        return fromReceipt.equals(configured);
    }

    /**
     * Checks the first name token, and nothing more.
     *
     * Three cases, in order of how much of the name survived masking:
     *
     * The whole first token is legible ("MOHAMED") — compare it, ignoring
     * case, against the configured first token.
     *
     * The first token is itself partly masked ("M******") — compare only
     * the letters before the first asterisk. Some apps mask more
     * aggressively than others and a receipt that shows one real letter is
     * still evidence, just weaker evidence. The phone number is what
     * actually decided this transfer.
     *
     * There is no name at all — that is a miss. ORB-013 is explicit that a
     * missing recipient name is WRONG_RECIPIENT, not a pass.
     */
    public boolean nameMatches(String receiptNameMasked) {
        String receiptToken = firstToken(receiptNameMasked);
        String configuredToken = firstToken(props.getAccountName());

        if (receiptToken == null || configuredToken == null) {
            return false;
        }

        int asterisk = receiptToken.indexOf('*');
        if (asterisk < 0) {
            return receiptToken.equalsIgnoreCase(configuredToken);
        }

        String visiblePrefix = receiptToken.substring(0, asterisk);
        if (visiblePrefix.isEmpty()) {
            // The token is nothing but asterisks. It carries no information,
            // and treating no information as a match would quietly turn the
            // name check off.
            return false;
        }

        return configuredToken.regionMatches(true, 0, visiblePrefix, 0, visiblePrefix.length());
    }

    /** The last ten digits, or null when there are not that many. */
    private static String significantDigits(String raw) {
        if (raw == null) {
            return null;
        }

        StringBuilder digits = new StringBuilder(raw.length());
        for (char c : raw.toCharArray()) {
            if (Character.isDigit(c)) {
                digits.append(c);
            }
        }

        if (digits.length() < SIGNIFICANT_DIGITS) {
            return null;
        }

        return digits.substring(digits.length() - SIGNIFICANT_DIGITS);
    }

    /** First whitespace-separated token, trimmed, or null when there is none. */
    private static String firstToken(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }

        String[] tokens = raw.trim().split("\\s+");
        return tokens.length == 0 || tokens[0].isEmpty() ? null : tokens[0];
    }
}
