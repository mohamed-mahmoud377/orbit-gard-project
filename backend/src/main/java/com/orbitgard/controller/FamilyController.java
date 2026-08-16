package com.orbitgard.controller;

import com.orbitgard.dto.response.FamilyChildResponse;
import com.orbitgard.dto.response.FamilyOverviewResponse;
import com.orbitgard.service.FamilyService;
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

@RestController
@RequestMapping("/family")
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
}
