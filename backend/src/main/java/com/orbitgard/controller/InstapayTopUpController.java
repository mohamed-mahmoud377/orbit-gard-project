package com.orbitgard.controller;

import com.orbitgard.dto.response.InstapayAccountResponse;
import com.orbitgard.dto.response.InstapayRequestListResponse;
import com.orbitgard.dto.response.InstapayRequestResponse;
import com.orbitgard.dto.response.InstapayUploadResponse;
import com.orbitgard.service.InstapayTopUpService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.UUID;

@RestController
@RequestMapping("/wallet/topup/instapay")
@Tag(name = "InstaPay Top-Up", description = "Upload InstaPay transfer receipt screenshot for wallet top-up (ORB-013 / TECH-003)")
@SecurityRequirement(name = "bearerAuth")
public class InstapayTopUpController {

    private final InstapayTopUpService instapayTopUpService;

    public InstapayTopUpController(InstapayTopUpService instapayTopUpService) {
        this.instapayTopUpService = instapayTopUpService;
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Upload InstaPay transfer confirmation receipt",
            description = "Accepts a PNG or JPG receipt screenshot up to 1 MB. Validates file integrity, calculates SHA-256 to prevent duplicate uploads, stores the image, and queues the request as PENDING for automated background verification."
    )
    @ApiResponses({
            @ApiResponse(
                    responseCode = "202",
                    description = "Receipt uploaded and queued for processing",
                    content = @Content(schema = @Schema(implementation = InstapayUploadResponse.class))
            ),
            @ApiResponse(responseCode = "400", description = "File is missing, not an image, or exceeds 1 MB limit"),
            @ApiResponse(responseCode = "401", description = "Authentication required"),
            @ApiResponse(responseCode = "403", description = "Child accounts cannot top up"),
            @ApiResponse(responseCode = "409", description = "Duplicate receipt image already uploaded")
    })
    public ResponseEntity<InstapayUploadResponse> uploadReceipt(
            @RequestParam("file") MultipartFile file) {
        InstapayUploadResponse response = instapayTopUpService.uploadReceipt(file);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(response);
    }

    @GetMapping
    @Operation(
            summary = "List the user's InstaPay requests",
            description = "Every request the authenticated user has made, newest first. Amount and reference are null on PENDING and PROCESSING rows — they are read out of the image, so they do not exist until the check has run. anyUnresolved is true while any row is still PENDING or PROCESSING; the requests page refreshes about every two seconds while it is true and stops when it is false."
    )
    @ApiResponses({
            @ApiResponse(
                    responseCode = "200",
                    description = "Requests returned, newest first",
                    content = @Content(schema = @Schema(implementation = InstapayRequestListResponse.class))
            ),
            @ApiResponse(responseCode = "401", description = "Authentication required")
    })
    public ResponseEntity<InstapayRequestListResponse> listRequests() {
        return ResponseEntity.ok(instapayTopUpService.listRequests());
    }

    @GetMapping("/{requestId}")
    @Operation(
            summary = "Get one InstaPay request",
            description = "One request belonging to the authenticated user. Useful for following a single upload without re-fetching the whole list. Another user's request is a 404."
    )
    @ApiResponses({
            @ApiResponse(
                    responseCode = "200",
                    description = "Request returned",
                    content = @Content(schema = @Schema(implementation = InstapayRequestResponse.class))
            ),
            @ApiResponse(responseCode = "401", description = "Authentication required"),
            @ApiResponse(responseCode = "404", description = "No such request for this user")
    })
    public ResponseEntity<InstapayRequestResponse> getRequest(@PathVariable UUID requestId) {
        return ResponseEntity.ok(instapayTopUpService.getRequest(requestId));
    }

    @GetMapping("/account")
    @Operation(
            summary = "Where to send the InstaPay transfer",
            description = "The account name and mobile number the transfer must be addressed to, and the limits Orbit will accept. Served from configuration so the screen and the rules can never disagree about which account is Orbit's."
    )
    @ApiResponses({
            @ApiResponse(
                    responseCode = "200",
                    description = "Account details returned",
                    content = @Content(schema = @Schema(implementation = InstapayAccountResponse.class))
            ),
            @ApiResponse(responseCode = "401", description = "Authentication required")
    })
    public ResponseEntity<InstapayAccountResponse> getAccountDetails() {
        return ResponseEntity.ok(instapayTopUpService.getAccountDetails());
    }
}