package com.orbitgard.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.UUID;

@Schema(description = "Result of a completed internal transfer. Two linked transactions are always written — a debit on the sender and a credit on the receiver.")
public record InternalTransferResponse(

        @Schema(description = "ID of the debit transaction recorded on the sender's wallet.")
        UUID debitTransactionId,

        @Schema(description = "Reference of the debit transaction, quotable by the sender.", example = "TXN-8F3A2B1C")
        String debitReference,

        @Schema(description = "ID of the credit transaction recorded on the receiver's wallet.")
        UUID creditTransactionId,

        @Schema(description = "Reference of the credit transaction, quotable by the receiver.", example = "TXN-4D9E7A02")
        String creditReference,

        @Schema(description = "Status the credit transaction was written with. COMPLETED if under EGP 5,000, PENDING if at or above the threshold — the debit is always COMPLETED and isn't reported separately.", example = "COMPLETED", allowableValues = {"COMPLETED", "PENDING"})
        String creditStatus

) {}