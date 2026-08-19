package com.orbitgard.receipt;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Builder;

/**
 * What the model read off one receipt image. Transcription only — there is
 * no verdict in here and there must never be one. Whether these values are
 * acceptable is decided in Java against configuration.
 *
 * Every field except isTransferReceipt is nullable by design. The system
 * instruction is explicit that a value which is not visible comes back as
 * null, and a null must survive all the way to the rules so it can become
 * REFERENCE_NOT_VISIBLE rather than a validation failure.
 *
 * The constraints below are therefore SHAPE checks, not business checks.
 * They answer "did the model return something in the format we asked for",
 * and a violation means a malformed response worth retrying — not a
 * rejection the user should read. Nothing here compares a value against
 * Orbit's account, the amount limits, or anything else the rules own.
 *
 * The @Size caps are load-bearing in a way that is easy to miss: this is
 * untrusted model output on its way into database columns. A model that
 * loses its footing on a blurry image can emit a very long string, and the
 * cap turns that into a clean retry instead of a truncation error at insert.
 */
@Builder(toBuilder = true)
@JsonIgnoreProperties(ignoreUnknown = true)
public record ReceiptExtraction(

        /*
         * The only required field in the response schema. Null here means the
         * model did not answer the one question it was obliged to answer, so
         * the response is malformed rather than negative.
         */
        @NotNull(message = "FIELD_REQUIRED")
        Boolean isTransferReceipt,

        Boolean isSuccessful,

        /** The headline transfer amount — what the recipient receives. */
        @Pattern(regexp = "^\\d{1,13}(\\.\\d{1,2})?$", message = "DECIMAL_STRING_INVALID")
        String amount,

        /**
         * The amount exactly as printed, Arabic-Indic digits and currency
         * symbol included. No pattern: the whole point is that it is
         * unnormalised, and it exists so the rules can cross-check it
         * against the parsed amount.
         */
        @Size(max = 64, message = "FIELD_TOO_LONG")
        String amountAsShown,

        @Pattern(regexp = "^[A-Z]{3}$", message = "CURRENCY_CODE_INVALID")
        String currency,

        @Pattern(regexp = "^\\d{1,13}(\\.\\d{1,2})?$", message = "DECIMAL_STRING_INVALID")
        String fees,

        /**
         * What the sender paid their bank, which is not what arrived. Read
         * so the rules can tell the two apart; never credited.
         */
        @Pattern(regexp = "^\\d{1,13}(\\.\\d{1,2})?$", message = "DECIMAL_STRING_INVALID")
        String totalAmount,

        @Size(min = 4, max = 64, message = "REFERENCE_NUMBER_INVALID")
        @Pattern(regexp = "^[A-Za-z0-9][A-Za-z0-9/-]*$", message = "REFERENCE_NUMBER_INVALID")
         String referenceNumber,

        /**
         * Masked as printed — "MOHAMED M****** S*** I*****". Asterisks are
         * expected characters here, so no pattern is applied.
         */
        @Size(max = 128, message = "FIELD_TOO_LONG")
        String recipientNameMasked,

        @Pattern(regexp = "^\\d{6,20}$", message = "PHONE_DIGITS_INVALID")
        String recipientPhone,

        @Size(max = 128, message = "FIELD_TOO_LONG")
        String senderHandle,

        @Size(max = 128, message = "FIELD_TOO_LONG")
        String senderBank,

        @Pattern(regexp = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(:\\d{2})?$", message = "DATE_TIME_FORMAT_INVALID")
        String transferDateTime,

        /**
         * Free text the sender typed. Capped hard: this is the field most
         * likely to carry an injection attempt, and it is never interpreted
         * as anything but a string.
         */
        @Size(max = 512, message = "FIELD_TOO_LONG")
        String note
) {
}
