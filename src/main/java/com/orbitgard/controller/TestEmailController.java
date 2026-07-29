package com.orbitgard.controller;

import com.orbitgard.entity.User;
import com.orbitgard.repository.UserRepository;
import com.orbitgard.service.VerificationEmailService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

// TEMPORARY — manual testing only. Delete once signup calls VerificationEmailService for real.
@RestController
@RequiredArgsConstructor
public class TestEmailController {

    private final VerificationEmailService verificationEmailService;
    private final UserRepository userRepository;

    @PostMapping("/api/v1/test/send-verification-email/{userId}")
    public ResponseEntity<String> test(@PathVariable UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        verificationEmailService.sendVerificationEmail(user);
        return ResponseEntity.ok("Email sent to " + user.getEmail());
    }
}