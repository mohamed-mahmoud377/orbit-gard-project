package com.orbitgard.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;

@Schema(description = "A page of one child's activity, newest first. Page numbering is zero-based.")
public record ChildTransactionPageResponse(
        List<ChildTransactionResponse> content,
        @Schema(description = "Zero-based page number.", example = "0") int page,
        @Schema(description = "Requested page size.", example = "10") int size,
        long totalElements,
        int totalPages,
        boolean first,
        boolean last
) {
}
