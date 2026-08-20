package com.orbitgard.wallet;

import com.orbitgard.exceptions.ErrorCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The reference number has to survive into the wallet ledger.
 *
 * TECH-003 section 11 asks for it and ORB-013 says why: that string is the
 * thread tying a line in somebody's wallet back to a real transfer at a
 * real bank. Without it nobody can answer "where did this money come from"
 * six weeks later — which is a question that gets asked precisely when it
 * is hardest to reconstruct.
 *
 * Worth its own test because it is the kind of detail that survives code
 * review and then quietly disappears in a refactor of the description
 * format.
 */
class InstapayTransactionDescriptionTest {

    @Test
    @DisplayName("the description carries the reference number")
    void descriptionContainsTheReference() {
        String description = TransactionDescriptions.instapayTopUp("461669173693");

        assertThat(description).contains("461669173693");
    }

    @Test
    @DisplayName("it is still recognisable as a top-up")
    void descriptionStillReadsAsATopUp() {
        assertThat(TransactionDescriptions.instapayTopUp("461669173693"))
                .containsIgnoringCase("top-up")
                .containsIgnoringCase("instapay");
    }

    @Test
    @DisplayName("the InstaPay marker cannot be mistaken for the blocked suffix")
    void doesNotCollideWithTheBlockedParser() {
        // The two markers live in the same string and the blocked one is
        // parsed back out. A reference that looked like a blocked suffix
        // would put a fake refusal reason on a perfectly good credit.
        String description = TransactionDescriptions.instapayTopUp("461669173693");

        assertThat(TransactionDescriptions.blockedReasonOf(description)).isNull();
        assertThat(TransactionDescriptions.merchantOf(description)).isNull();
    }

    @Test
    @DisplayName("a blocked suffix on top of it still parses correctly")
    void blockedSuffixStillWins() {
        String blocked = TransactionDescriptions.blocked(
                TransactionDescriptions.instapayTopUp("461669173693"),
                ErrorCode.FILE_TOO_LARGE);

        assertThat(TransactionDescriptions.blockedReasonOf(blocked))
                .isEqualTo(ErrorCode.FILE_TOO_LARGE.name());
        assertThat(blocked).contains("461669173693");
    }
}
