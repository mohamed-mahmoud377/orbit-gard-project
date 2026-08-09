package com.orbitgard.controller;

import com.orbitgard.dto.request.ChangePasswordRequest;
import com.orbitgard.dto.request.PasswordResetConfirmRequest;
import com.orbitgard.dto.request.PasswordResetRequest;
import com.orbitgard.dto.response.ChangePasswordResponse;
import com.orbitgard.dto.response.PasswordResetConfirmResponse;
import com.orbitgard.dto.response.PasswordResetRequestResponse;
import com.orbitgard.service.PasswordService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/password")
@Tag(name = "Password", description = "Change a known password, or reset a forgotten one")
public class PasswordController {

    private final PasswordService passwordService;

    public PasswordController(PasswordService passwordService) {
        this.passwordService = passwordService;
    }

    @PostMapping("/change")
    @Operation(summary = "Change my password",
            description = "Requires the current password. Signs out every device, including this one.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Password changed",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = ChangePasswordResponse.class))),
            @ApiResponse(responseCode = "400", description = "Validation failed, wrong current password, or passwords do not match", content = @Content),
            @ApiResponse(responseCode = "401", description = "Not authenticated", content = @Content),
            @ApiResponse(responseCode = "409", description = "New password is the same as the current one", content = @Content)
    })
    public ResponseEntity<ChangePasswordResponse> changePassword(
            @Valid @RequestBody ChangePasswordRequest request) {
        return ResponseEntity.ok(passwordService.changePassword(request));
    }

    @GetMapping("/active-sessions-count")
    @Operation(summary = "Count active sessions",
            description = "Returns how many devices are currently signed in, for display before a password change.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Active session count",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = Integer.class))),
            @ApiResponse(responseCode = "401", description = "Not authenticated", content = @Content)
    })
    public ResponseEntity<Integer> getActiveSessionCount() {
        return ResponseEntity.ok(passwordService.countActiveSessions());
    }

    @PostMapping("/reset/request")
    @Operation(summary = "Request a password reset link",
            description = "Sends a reset link if the address is registered. Always returns the same response, whether or not the address exists.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Generic confirmation, regardless of whether the account exists",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = PasswordResetRequestResponse.class))),
            @ApiResponse(responseCode = "400", description = "Malformed email address", content = @Content)
    })
    public ResponseEntity<PasswordResetRequestResponse> requestReset(
            @Valid @RequestBody PasswordResetRequest request) {
        return ResponseEntity.ok(passwordService.requestPasswordReset(request));
    }

    @PostMapping("/reset/confirm")
    @Operation(summary = "Set a new password using a reset link",
            description = "The token from the reset link proves identity; no current password is required. Links expire after 30 minutes and can only be used once.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Password reset",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = PasswordResetConfirmResponse.class))),
            @ApiResponse(responseCode = "400", description = "Validation failed, invalid token, or passwords do not match", content = @Content),
            @ApiResponse(responseCode = "409", description = "New password is the same as the current one", content = @Content),
            @ApiResponse(responseCode = "410", description = "Token has expired or was already used", content = @Content)
    })
    public ResponseEntity<PasswordResetConfirmResponse> confirmReset(
            @Valid @RequestBody PasswordResetConfirmRequest request) {
        return ResponseEntity.ok(passwordService.confirmPasswordReset(request));
    }
}