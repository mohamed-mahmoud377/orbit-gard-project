package com.orbitgard.controller;

import com.orbitgard.dto.request.InternalTransferRequest;
import com.orbitgard.dto.response.InternalTransferResponse;
import com.orbitgard.dto.response.WalletBalanceResponse;
import com.orbitgard.dto.response.WalletTransactionPageResponse;
import com.orbitgard.service.AuthenticatedUserService;
import com.orbitgard.service.InternalTransferService;
import com.orbitgard.service.WalletService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;
import jakarta.validation.constraints.Min;

@RestController
@RequestMapping("/wallet")
@Validated
@Tag(name = "Wallet", description = "Wallet balance and transaction history (ORB-011)")
@SecurityRequirement(name = "bearerAuth")
public class WalletController {

    private final WalletService walletService;
    private final AuthenticatedUserService authenticatedUserService;
    private final InternalTransferService internalTransferService;

    public WalletController(WalletService walletService, AuthenticatedUserService authenticatedUserService, InternalTransferService internalTransferService) {
        this.walletService = walletService;
        this.authenticatedUserService = authenticatedUserService;
        this.internalTransferService = internalTransferService;
    }

    @GetMapping
    @Operation(summary = "Get wallet balance", description = "Returns recorded balance, pending held money, and derived spendable balance for the authenticated user.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Wallet figures returned"),
            @ApiResponse(responseCode = "401", description = "Authentication required")
    })
    public ResponseEntity<WalletBalanceResponse> getWallet() {
        UUID userId = authenticatedUserService.currentPrincipal().userId();
        return ResponseEntity.ok(walletService.getBalanceForUser(userId));
    }

    @GetMapping("/transactions")
    @Operation(summary = "List wallet transactions", description = "Returns immutable transaction history in chronological order, 10 transactions per page. Page numbering is zero-based.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Transaction history returned"),
            @ApiResponse(responseCode = "401", description = "Authentication required")
    })
    public ResponseEntity<WalletTransactionPageResponse> listTransactions(
            @RequestParam(defaultValue = "0") @Min(0) int page) {
        UUID userId = authenticatedUserService.currentPrincipal().userId();
        return ResponseEntity.ok(walletService.listTransactionsForUser(userId, page));
    }

    @PostMapping("/internal/transfer")
    @Operation(summary = "Send an internal transfer", description = "Moves money from the authenticated user's wallet to another Orbit user's wallet by username. Writes two linked transactions — a debit on the sender and a credit on the receiver.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Transfer recorded"),
            @ApiResponse(responseCode = "400", description = "Invalid amount or self-transfer attempted"),
            @ApiResponse(responseCode = "401", description = "Authentication required"),
            @ApiResponse(responseCode = "404", description = "Receiver not found"),
            @ApiResponse(responseCode = "422", description = "Insufficient available balance")
    })
    public ResponseEntity<InternalTransferResponse> transfer(@Valid @RequestBody InternalTransferRequest request) {
        return ResponseEntity.ok(internalTransferService.transfer(request));
    }
}
