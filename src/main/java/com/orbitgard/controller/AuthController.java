package com.orbitgard.controller;

import com.orbitgard.dto.request.ResendVerificationRequest;
import com.orbitgard.dto.response.ResendVerificationResponse;
import com.orbitgard.dto.request.VerifyEmailRequest;
import com.orbitgard.dto.response.VerifyEmailResponse;
import com.orbitgard.service.AuthService;
import com.orbitgard.service.VerificationEmailService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final VerificationEmailService verificationEmailService;

    @PostMapping("/verify")
    public ResponseEntity<VerifyEmailResponse> verify(@Valid @RequestBody VerifyEmailRequest request) {
        return ResponseEntity.ok(authService.verifyEmail(request.getToken()));
    }

    @PostMapping("/verify/resend")
    public ResponseEntity<ResendVerificationResponse> resend(@Valid @RequestBody ResendVerificationRequest request) {
        ResendVerificationResponse response = verificationEmailService.resendVerification(request.getEmail());
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(response);
    }
}