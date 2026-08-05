package com.orbitgard.controller;

import com.orbitgard.dto.response.MessageResponse;
import com.orbitgard.dto.response.SessionSummaryResponse;
import com.orbitgard.security.JwtPrincipal;
import com.orbitgard.service.SessionService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
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
public class SessionController {

    private final SessionService sessionService;

    public SessionController(SessionService sessionService) {
        this.sessionService = sessionService;
    }

    @GetMapping
    public ResponseEntity<List<SessionSummaryResponse>> list(@AuthenticationPrincipal JwtPrincipal principal) {
        return ResponseEntity.ok(
                sessionService.listActiveSessions(principal.userId(), principal.sessionId()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<MessageResponse> signOutOne(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID id) {
        sessionService.signOutOne(principal.userId(), principal.sessionId(), id);
        return ResponseEntity.ok(new MessageResponse("Session deleted successfully"));
    }

    @PostMapping("/sign-out-others")
    public ResponseEntity<MessageResponse> signOutAllOthers(@AuthenticationPrincipal JwtPrincipal principal) {
        sessionService.signOutAllOthers(principal.userId(), principal.sessionId());
        return ResponseEntity.ok(new MessageResponse("All other sessions have been signed out successfully"));
    }
}
