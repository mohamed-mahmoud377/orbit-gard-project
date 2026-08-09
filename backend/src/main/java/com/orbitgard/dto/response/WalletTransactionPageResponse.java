package com.orbitgard.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;

@Schema(description = "A page of wallet transactions. Page numbering is zero-based and the page size is always 10.")
public record WalletTransactionPageResponse(
        List<WalletTransactionResponse> content,
        @Schema(description = "Zero-based page number.", example = "0") int page,
        @Schema(description = "Fixed number of transactions per page.", example = "10") int size,
        long totalElements,
        int totalPages,
        boolean first,
        boolean last
) {
}
