package com.orbitgard.controller;

import com.orbitgard.dto.response.WalletBalanceResponse;
import com.orbitgard.dto.response.WalletTransactionPageResponse;
import com.orbitgard.service.AuthenticatedUserService;
import com.orbitgard.service.WalletService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

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

    public WalletController(WalletService walletService, AuthenticatedUserService authenticatedUserService) {
        this.walletService = walletService;
        this.authenticatedUserService = authenticatedUserService;
    }

    @GetMapping
    @Operation(summary = "Get wallet balance", description = "Returns recorded balance, pending held money, and derived spendable balance for the authenticated user.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Wallet figures returned"),
            @ApiResponse(responseCode = "401", description = "Authentication required")
    })
    public ResponseEntity<WalletBalanceResponse> getWallet() {
        UUID userId = authenticatedUserService.currentPrincipal().userId(); // hal de bardo el mafrod tb2a fe el service wala 3ady??
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
}
