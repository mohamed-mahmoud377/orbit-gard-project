package com.orbitgard.dto.response;

import com.orbitgard.enums.InstapayRejectionReason;
import com.orbitgard.enums.InstapayRequestStatus;
import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * One row of the requests page.
 *
 * Almost everything here is nullable, and that is the contract rather than
 * an oversight. The amount and the reference are read out of the picture,
 * so they do not exist until the check has run — a PENDING or PROCESSING
 * row genuinely has neither, and ORB-013 says the list shows a dash. A
 * client that assumes these fields are always filled in will break on the
 * first upload it ever makes.
 *
 * The status is the real one. There is no friendlier re-labelling in
 * between: what Orbit records is what the user reads.
 */
@Schema(description = "An InstaPay top-up request. Amount and reference are null until the receipt has been read.")
public record InstapayRequestResponse(

        UUID id,

        InstapayRequestStatus status,

        @Schema(description = "Transfer amount credited or read from the receipt, in EGP. Null until the receipt has been read.",
                example = "1.00")
        BigDecimal amount,

        @Schema(description = "Bank reference read off the receipt. Null while queued, and on any receipt that did not carry one.",
                example = "461669173693")
        String referenceNumber,

        /**
         * The code, never the sentence. The frontend maps it to the wording
         * in the error catalogue, so a message can be improved without a
         * database migration.
         */
        @Schema(description = "Rejection code, present only on REJECTED rows. The client maps this to user-facing wording.",
                example = "REFERENCE_NOT_VISIBLE")
        InstapayRejectionReason rejectionReason,

        @Schema(description = "When the receipt was uploaded. The list is ordered by this, newest first.")
        OffsetDateTime submittedAt,

        @Schema(description = "When the request reached a final status. Null while it is still queued or being read.")
        OffsetDateTime resolvedAt
) {
}
