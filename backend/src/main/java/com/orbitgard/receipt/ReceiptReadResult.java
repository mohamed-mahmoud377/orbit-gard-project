package com.orbitgard.receipt;

import com.orbitgard.enums.ReceiptReadFailure;
import lombok.Builder;

import java.time.Duration;

/**
 * One call to the model: what was read, and what it cost.
 *
 * The cost fields travel with the extraction rather than being fetched
 * separately, because they have to be recorded even when the read fails a
 * rule — a rejection still cost a call. Keeping them in the same object
 * makes forgetting that harder.
 *
 * extraction is null when the read failed. Callers should branch on
 * successful() rather than null-checking, and must still persist the token
 * counts either way.
 */
@Builder
public record ReceiptReadResult(

        ReceiptExtraction extraction,

        /** Which model produced this. A token count without one cannot be priced. */
        String model,

        int inputTokens,

        int outputTokens,

        /** Wall-clock time for the call — the evidence behind the 30-second promise. */
        Duration callDuration,

        /** Null on success; set when the read failed and the row cannot be decided. */
        ReceiptReadFailure failure
) {

    public boolean successful() {
        return failure == null && extraction != null;
    }

    /**
     * Why a read produced no usable extraction.
     *
     * All of these mean "we never got an answer" — the row is FAILED and
     * retryable, never REJECTED. A rejection requires the model to have
     * answered and a rule to have said no, which is a decision this layer
     * does not make.
     */

}
