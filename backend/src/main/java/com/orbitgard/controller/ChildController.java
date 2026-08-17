package com.orbitgard.controller;

import com.orbitgard.dto.response.ChildActivitySummaryResponse;
import com.orbitgard.dto.response.ChildTransactionPageResponse;
import com.orbitgard.dto.response.ChildWalletResponse;
import com.orbitgard.service.ChildSelfService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * A child's view of their own wallet.
 *
 * No endpoint here takes an id. The wallet is resolved from the JWT, so a
 * child cannot address anyone else's — there is no parameter to tamper with.
 * Parent-side equivalents live under /family.
 */
@RestController
@RequestMapping("/child")
@Validated
@Tag(name = "Child", description = "A child's self-scoped view of their own wallet, limits, and activity")
@SecurityRequirement(name = "bearerAuth")
public class ChildController {

    private final ChildSelfService childSelfService;

    public ChildController(ChildSelfService childSelfService) {
        this.childSelfService = childSelfService;
    }

    @GetMapping("/wallet")
    @Operation(summary = "Get my wallet, limits, and what is being checked",
            description = "Balances, both limit windows with remaining headroom, transactions still being checked, and the last five movements. Windows are cut in UTC to match enforcement, so `resetsAt: \"midnight\"` means UTC midnight.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Wallet returned"),
            @ApiResponse(responseCode = "401", description = "Authentication required"),
            @ApiResponse(responseCode = "403", description = "Only CHILD accounts have this view")
    })
    public ResponseEntity<ChildWalletResponse> getOwnWallet() {
        return ResponseEntity.ok(childSelfService.getOwnWallet());
    }

    @GetMapping("/activity/summary")
    @Operation(summary = "Get my spend and receipt counters",
            description = "Spent today, spent this month, received this month, and blocked count — all over UTC windows. `blockedCount` counts REJECTED transactions; since limit violations currently persist nothing, it reads 0 until blocked-attempt recording exists.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Summary returned"),
            @ApiResponse(responseCode = "401", description = "Authentication required"),
            @ApiResponse(responseCode = "403", description = "Only CHILD accounts have this view")
    })
    public ResponseEntity<ChildActivitySummaryResponse> getOwnActivitySummary() {
        return ResponseEntity.ok(childSelfService.getOwnActivitySummary());
    }

    @GetMapping("/transactions")
    @Operation(summary = "List my activity",
            description = "Newest first, zero-based paging. Same row shape as the parent's per-child feed: amount is always positive and `direction` says which way the money moved. `blockedReason` is always null — no rejection reason is persisted anywhere in the schema yet.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Activity returned"),
            @ApiResponse(responseCode = "400", description = "Invalid page or size"),
            @ApiResponse(responseCode = "401", description = "Authentication required"),
            @ApiResponse(responseCode = "403", description = "Only CHILD accounts have this view")
    })
    public ResponseEntity<ChildTransactionPageResponse> listOwnTransactions(
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "10") @Min(1) @Max(100) int size) {
        return ResponseEntity.ok(childSelfService.listOwnTransactions(page, size));
    }
}
