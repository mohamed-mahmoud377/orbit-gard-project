package com.orbitgard.controller;

import com.orbitgard.dto.request.UpdateChildLimitsRequest;
import com.orbitgard.dto.response.ChildTransactionPageResponse;
import com.orbitgard.dto.response.FamilyChildDetailResponse;
import com.orbitgard.dto.response.FamilyChildResponse;
import com.orbitgard.dto.response.FamilyOverviewResponse;
import com.orbitgard.service.FamilyService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/family")
@Validated
@Tag(name = "Family", description = "Parent-side view of children, their wallets, and their limits")
@SecurityRequirement(name = "bearerAuth")
public class FamilyController {

    private final FamilyService familyService;

    public FamilyController(FamilyService familyService) {
        this.familyService = familyService;
    }

    @GetMapping("/overview")
    @Operation(summary = "Get the family stats bar",
            description = "Returns children count, money allocated to children this month, money the children spent this month, and blocked attempts — the four figures across the top of the Family tab.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Overview returned"),
            @ApiResponse(responseCode = "401", description = "Authentication required"),
            @ApiResponse(responseCode = "403", description = "Child accounts have no family view")
    })
    public ResponseEntity<FamilyOverviewResponse> getOverview() {
        return ResponseEntity.ok(familyService.getOverview());
    }

    @GetMapping("/children")
    @Operation(summary = "List children with wallet and limit progress",
            description = "Returns one entry per child — identity, wallet snapshot (balance, held, available), and spend-so-far against the daily and monthly ceilings. Ordered oldest child first. Empty array when the parent has no children yet.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Children returned"),
            @ApiResponse(responseCode = "401", description = "Authentication required"),
            @ApiResponse(responseCode = "403", description = "Child accounts have no family view")
    })
    public ResponseEntity<List<FamilyChildResponse>> listChildren() {
        return ResponseEntity.ok(familyService.listChildren());
    }

    @GetMapping("/children/{childId}")
    @Operation(summary = "Get one child's detail",
            description = "Header, wallet snapshot, allocation received this month, and the full limits block including remaining headroom. Returns 404 for a child id that belongs to another parent — indistinguishable from one that does not exist.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Child returned"),
            @ApiResponse(responseCode = "401", description = "Authentication required"),
            @ApiResponse(responseCode = "403", description = "Child accounts have no family view"),
            @ApiResponse(responseCode = "404", description = "No such child under this parent")
    })
    public ResponseEntity<FamilyChildDetailResponse> getChild(@PathVariable UUID childId) {
        return ResponseEntity.ok(familyService.getChild(childId));
    }

    @PatchMapping("/children/{childId}/limits")
    @Operation(summary = "Edit a child's spending limits",
            description = "Partial update — omit a field to leave that ceiling unchanged, but send at least one. Ordering (per-transaction <= daily <= monthly) is validated against the merged result, not the submitted fields alone. Parent accounts only. Returns the refreshed detail view.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Limits updated"),
            @ApiResponse(responseCode = "400", description = "No field sent, non-positive amount, or limits out of order"),
            @ApiResponse(responseCode = "401", description = "Authentication required"),
            @ApiResponse(responseCode = "403", description = "Child accounts cannot edit limits"),
            @ApiResponse(responseCode = "404", description = "No such child under this parent")
    })
    public ResponseEntity<FamilyChildDetailResponse> updateChildLimits(
            @PathVariable UUID childId,
            @Valid @RequestBody UpdateChildLimitsRequest request) {
        return ResponseEntity.ok(familyService.updateChildLimits(childId, request));
    }

    @GetMapping("/children/{childId}/transactions")
    @Operation(summary = "List one child's activity",
            description = "Newest first, zero-based paging. Amounts are signed for display — negative for debits, positive for credits. `reason` is always null: no rejection reason is persisted anywhere in the schema yet.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Activity returned"),
            @ApiResponse(responseCode = "400", description = "Invalid page or size"),
            @ApiResponse(responseCode = "401", description = "Authentication required"),
            @ApiResponse(responseCode = "403", description = "Child accounts have no family view"),
            @ApiResponse(responseCode = "404", description = "No such child under this parent")
    })
    public ResponseEntity<ChildTransactionPageResponse> listChildTransactions(
            @PathVariable UUID childId,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "10") @Min(1) @Max(100) int size) {
        return ResponseEntity.ok(familyService.listChildTransactions(childId, page, size));
    }
}