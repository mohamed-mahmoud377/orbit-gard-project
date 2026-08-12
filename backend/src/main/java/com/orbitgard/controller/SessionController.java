package com.orbitgard.controller;

import com.orbitgard.dto.response.SessionSummaryResponse;
import com.orbitgard.service.SessionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/sessions")
@SecurityRequirement(name = "bearerAuth")
@Tag(name = "Sessions", description = "Manage the authenticated user's active login sessions/devices")
public class SessionController {

    private final SessionService sessionService;

    public SessionController(SessionService sessionService) {
        this.sessionService = sessionService;
    }

    @GetMapping
    @Operation(
            summary = "List active sessions",
            description = "Returns all currently active sessions (devices) for the authenticated user, " +
                    "including which one is the current device."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Active sessions returned",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = SessionSummaryResponse.class))),
            @ApiResponse(responseCode = "401", description = "Not authenticated", content = @Content)
    })
    public ResponseEntity<List<SessionSummaryResponse>> list() {
        return ResponseEntity.ok(
                sessionService.listActiveSessions());
    }

    @DeleteMapping("/{id}")
    @Operation(
            summary = "Sign out a specific session",
            description = "Revokes a single session by id. Cannot be used to sign out the session " +
                    "making the current request — use /sessions/sign-out-others or the dedicated " +
                    "current-session logout endpoint for that."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Session revoked", content = @Content),
            @ApiResponse(responseCode = "400", description = "Attempted to sign out the current device",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE)),
            @ApiResponse(responseCode = "401", description = "Not authenticated", content = @Content),
            @ApiResponse(responseCode = "404", description = "Session not found or not owned by user",
                    content = @Content)
    })
    public ResponseEntity<Void> signOutOne(
            @Parameter(description = "ID of the session to revoke", required = true)
            @PathVariable UUID id) {
        sessionService.signOutOne(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/sign-out-others")
    @Operation(
            summary = "Sign out all other sessions",
            description = "Revokes every active session for the authenticated user except the one " +
                    "making the current request."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Other sessions revoked", content = @Content),
            @ApiResponse(responseCode = "401", description = "Not authenticated", content = @Content)
    })
    public ResponseEntity<Void> signOutAllOthers() {
        sessionService.signOutAllOthers();
        return ResponseEntity.noContent().build();
    }
}