package com.orbitgard.controller;

import com.orbitgard.dto.request.ChangePasswordRequest;
import com.orbitgard.dto.response.ChangePasswordResponse;
import com.orbitgard.service.PasswordService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/password")
public class PasswordController {

    private final PasswordService passwordService;

    public PasswordController(PasswordService passwordService) {
        this.passwordService = passwordService;
    }

    @PostMapping("/change")
    public ResponseEntity<ChangePasswordResponse> changePassword(
            @Valid @RequestBody ChangePasswordRequest request) {
        return ResponseEntity.ok(passwordService.changePassword(request));
    }

    @GetMapping("/active-sessions-count")
    public ResponseEntity<Integer> getActiveSessionCount() {
        return ResponseEntity.ok(passwordService.countActiveSessions());
    }
}