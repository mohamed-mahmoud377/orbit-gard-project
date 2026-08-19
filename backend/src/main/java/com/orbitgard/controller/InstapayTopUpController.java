package com.orbitgard.controller;

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
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

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
}
