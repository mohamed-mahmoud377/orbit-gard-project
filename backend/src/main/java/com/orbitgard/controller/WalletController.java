package com.orbitgard.controller;

import com.orbitgard.dto.response.WalletBalanceResponse;
import com.orbitgard.dto.response.WalletTransactionResponse;
import com.orbitgard.service.AuthenticatedUserService;
import com.orbitgard.service.WalletService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/wallet")
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
        UUID userId = authenticatedUserService.currentPrincipal().userId();
        return ResponseEntity.ok(walletService.getBalanceForUser(userId));
    }

    @GetMapping("/transactions")
    @Operation(summary = "List wallet transactions", description = "Returns immutable transaction history in chronological order. Each entry includes the running balance before and after the movement.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Transaction history returned"),
            @ApiResponse(responseCode = "401", description = "Authentication required")
    })
    public ResponseEntity<List<WalletTransactionResponse>> listTransactions() {
        UUID userId = authenticatedUserService.currentPrincipal().userId();
        return ResponseEntity.ok(walletService.listTransactionsForUser(userId));
    }
}
