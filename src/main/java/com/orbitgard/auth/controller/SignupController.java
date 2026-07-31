package com.orbitgard.auth.controller;

import com.orbitgard.auth.service.SignupService;
import com.orbitgard.auth.dto.request.RegisterRequest;
import com.orbitgard.auth.dto.response.RegisterResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class SignupController {

    private final SignupService signupService;

    public SignupController(SignupService signupService) {
        this.signupService = signupService;
    }

    @PostMapping("/register")
    public ResponseEntity<RegisterResponse> register(
            @Valid @RequestBody RegisterRequest request) {

        RegisterResponse response = signupService.register(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }
}
