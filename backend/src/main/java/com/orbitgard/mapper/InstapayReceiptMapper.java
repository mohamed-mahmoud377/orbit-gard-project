package com.orbitgard.mapper;

import com.orbitgard.entity.InstapayTopUpRequest;
import com.orbitgard.instapay.ReceiptAmounts;
import com.orbitgard.receipt.ReceiptExtraction;
import com.orbitgard.receipt.ReceiptReadResult;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;

/**
 * Moves one model reading onto the row that will remember it.
 *
 * Two separate jobs, and the split matters: what was read, and what the
 * read cost. They are applied on different paths. A row whose call failed
 * has nothing to extract but still spent money, and if the cost only ever
 * travelled with a successful extraction the most expensive rows in the
 * table — the ones retried three times — would be recorded as the
 * cheapest.
 */
@Component
@Slf4j
public class InstapayReceiptMapper {

    /**
     * Writes the extracted fields.
     *
     * Every null is copied faithfully. A collapsed "More Details" section
     * genuinely has no reference in it, and that null has to survive onto
     * the row so the requests page can show a dash and the rejection
     * reason can be REFERENCE_NOT_VISIBLE rather than a guess.
     *
     * No truncation happens here, and none is needed: the @Size caps on
     * ReceiptExtraction are set to the same lengths as the columns, and
     * ReceiptExtractionValidator has already refused anything longer as a
     * malformed response. If those two ever drift apart the insert fails
     * loudly, which is the right way to find out.
     */
    public void applyExtraction(InstapayTopUpRequest row, ReceiptExtraction extraction) {
        if (extraction == null) {
            return;
        }

        row.setIsTransferReceipt(extraction.isTransferReceipt());
        row.setIsSuccessful(extraction.isSuccessful());

        row.setAmountCents(ReceiptAmounts.parseCents(extraction.amount()).orElse(null));
        row.setAmountAsShown(extraction.amountAsShown());
        row.setCurrency(extraction.currency());
        row.setFeesCents(ReceiptAmounts.parseCents(extraction.fees()).orElse(null));
        row.setTotalAmountCents(ReceiptAmounts.parseCents(extraction.totalAmount()).orElse(null));

        row.setReferenceNumber(extraction.referenceNumber());
        row.setRecipientNameMasked(extraction.recipientNameMasked());
        row.setRecipientPhone(extraction.recipientPhone());
        row.setSenderHandle(extraction.senderHandle());
        row.setSenderBank(extraction.senderBank());
        row.setTransferDateTime(parseLocal(extraction.transferDateTime()));
        row.setNote(extraction.note());
    }

    /**
     * Adds the cost of one call.
     *
     * Accumulating, never overwriting — a row retried three times cost
     * three calls and the honest number is the sum. The model name goes on
     * alongside, because prices differ per model and a token count without
     * one cannot be turned back into money once the model has been changed.
     */
    public void applyCost(InstapayTopUpRequest row, ReceiptReadResult read) {
        if (read == null) {
            return;
        }

        row.addTokenUsage(read.inputTokens(), read.outputTokens());
        row.setModel(read.model());

        Duration duration = read.callDuration();
        if (duration != null) {
            row.setCallDurationMs(duration.toMillis());
        }
    }

    /**
     * A receipt prints a wall-clock time with no offset anywhere on it, so
     * it is stored as one. Attaching a zone would be inventing information
     * the image never contained.
     *
     * An unparseable value becomes null rather than failing the row. The
     * @Pattern on the extraction already refused anything that is not ISO
     * local time, so reaching the catch means something upstream changed —
     * and losing a display-only timestamp is not a reason to reject money
     * that every other rule accepted.
     */
    private static LocalDateTime parseLocal(String isoLocal) {
        if (isoLocal == null || isoLocal.isBlank()) {
            return null;
        }
        try {
            return LocalDateTime.parse(isoLocal.trim());
        } catch (DateTimeParseException e) {
            log.warn("Receipt carried an unparseable transferDateTime; storing null");
            return null;
        }
    }
}
