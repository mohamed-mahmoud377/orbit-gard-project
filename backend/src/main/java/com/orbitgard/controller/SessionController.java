package com.orbitgard.controller;

import com.orbitgard.dto.response.SessionSummaryResponse;
import com.orbitgard.service.SessionService;
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
public class SessionController {

    private final SessionService sessionService;

    public SessionController(SessionService sessionService) {
        this.sessionService = sessionService;
    }

    @GetMapping
    public ResponseEntity<List<SessionSummaryResponse>> list() {
        return ResponseEntity.ok(
                sessionService.listActiveSessions());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> signOutOne(@PathVariable UUID id) {
        sessionService.signOutOne(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/sign-out-others")
    public ResponseEntity<Void> signOutAllOthers() {
        sessionService.signOutAllOthers();
        return ResponseEntity.noContent().build();
    }
}
