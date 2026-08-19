package com.orbitgard.entity;

import com.orbitgard.enums.InstapayRejectionReason;
import com.orbitgard.enums.InstapayRequestStatus;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * One uploaded InstaPay receipt and everything that happened to it.
 *
 * The table is also the job queue: a row in PENDING is a queued job. Nothing
 * else is needed for a workload this size, and Redis, RabbitMQ and Kafka are
 * all on Orbit's rejected list.
 *
 * User and transaction are held as plain UUIDs rather than @ManyToOne
 * associations, matching WalletTransaction — the closest analogue and the
 * other financial record in this schema. It also keeps the scheduled job
 * free of lazy proxies, which it would otherwise be touching outside any web
 * request.
 *
 * Every extracted field is nullable, and stays null until the job has run.
 * That is not laxness: a receipt with a collapsed "More Details" section
 * genuinely has no reference number in it, and that null has to reach the
 * rules intact so it can become REFERENCE_NOT_VISIBLE.
 */
@Entity
@Table(name = "instapay_topup_request")
@Getter
@Setter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class InstapayTopUpRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** Whose wallet gets credited, and whose list this appears in. */
    @Column(name = "user_id", nullable = false)
    private UUID userId;

    // =========================================================================
    // The stored file
    // =========================================================================

    /** Relative to the configured uploads directory — {yyyy}/{MM}/{uuid}.{ext}. */
    @Column(name = "storage_path", nullable = false, length = 512)
    private String storagePath;

    /** Kept for answering questions later. Never used to build a path. */
    @Column(name = "original_filename", length = 255)
    private String originalFilename;

    @Column(name = "content_type", length = 100)
    private String contentType;

    @Column(name = "size_bytes")
    private Long sizeBytes;

    /**
     * SHA-256 of the uploaded bytes, hex. Backs the unique index that stops
     * the same image being uploaded twice — the cheap duplicate, caught
     * before any money or any API call is involved.
     */
    @Column(name = "file_sha256", nullable = false, length = 64)
    private String fileSha256;

    // =========================================================================
    // Queue state
    // =========================================================================

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private InstapayRequestStatus status;

    /** Transport failures only. Rule failures are terminal and never retried. */
    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;

    // =========================================================================
    // What was read out of the image — all null until the job has run
    // =========================================================================

    @Column(name = "is_transfer_receipt")
    private Boolean isTransferReceipt;

    @Column(name = "is_successful")
    private Boolean isSuccessful;

    /** The headline transfer amount, in cents. This is what gets credited. */
    @Column(name = "amount_cents")
    private Long amountCents;

    /**
     * The amount exactly as printed — "1 EGP", or Arabic-Indic digits. Kept
     * unnormalised so a disagreement with amountCents is detectable.
     */
    @Column(name = "amount_as_shown", length = 64)
    private String amountAsShown;

    @Column(name = "currency", length = 3)
    private String currency;

    @Column(name = "fees_cents")
    private Long feesCents;

    /**
     * What the sender paid their bank. Stored so the two are distinguishable
     * six weeks later; never credited.
     */
    @Column(name = "total_amount_cents")
    private Long totalAmountCents;

    /** The thread back to a real transfer at a real bank. */
    @Column(name = "reference_number", length = 64)
    private String referenceNumber;

    /** Masked as printed — "MOHAMED M****** S*** I*****". Never expanded. */
    @Column(name = "recipient_name_masked", length = 128)
    private String recipientNameMasked;

    @Column(name = "recipient_phone", length = 20)
    private String recipientPhone;

    @Column(name = "sender_handle", length = 128)
    private String senderHandle;

    @Column(name = "sender_bank", length = 128)
    private String senderBank;

    /**
     * Local wall-clock, deliberately without a zone. A receipt prints a time
     * with no offset anywhere on it, and attaching one would be inventing
     * information the image does not contain.
     */
    @Column(name = "transfer_date_time")
    private LocalDateTime transferDateTime;

    @Column(name = "note", length = 512)
    private String note;

    // =========================================================================
    // What the read cost
    // =========================================================================

    /**
     * Input and output stay separate because output tokens cost several times
     * what input tokens do — a single total cannot be turned back into money,
     * and the ratio is what reveals an expensive prompt change.
     */
    @Column(name = "input_tokens", nullable = false)
    private int inputTokens;

    @Column(name = "output_tokens", nullable = false)
    private int outputTokens;

    /** Which model produced the numbers above. A token count without one cannot be priced. */
    @Column(name = "model", length = 64)
    private String model;

    /** Evidence for the 30-second promise in ORB-013. */
    @Column(name = "call_duration_ms")
    private Long callDurationMs;

    // =========================================================================
    // Outcome
    // =========================================================================

    /** The code, never the sentence — wording lives in the frontend catalogue. */
    @Enumerated(EnumType.STRING)
    @Column(name = "rejection_reason", length = 32)
    private InstapayRejectionReason rejectionReason;

    /** The wallet transaction this receipt produced, once credited. */
    @Column(name = "transaction_id")
    private UUID transactionId;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    /** Set when the row reaches a terminal status. */
    @Column(name = "resolved_at")
    private OffsetDateTime resolvedAt;

    @PrePersist
    private void onCreate() {
        if (createdAt == null) {
            createdAt = OffsetDateTime.now(ZoneOffset.UTC);
        }
        if (status == null) {
            status = InstapayRequestStatus.PENDING;
        }
    }

    // =========================================================================
    // Behaviour
    // =========================================================================

    /**
     * Adds the cost of one call to the running totals.
     *
     * Accumulating rather than overwriting is the whole point. A row retried
     * three times cost three calls, and overwriting would make the most
     * expensive rows in the table look like the cheapest.
     */
    public void addTokenUsage(int input, int output) {
        this.inputTokens += input;
        this.outputTokens += output;
    }

    /** True once the row will never be looked at again. */
    public boolean isTerminal() {
        return status == InstapayRequestStatus.COMPLETED
                || status == InstapayRequestStatus.REJECTED;
    }
}
