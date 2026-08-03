package com.orbitgard.controller;

import com.orbitgard.dto.request.TopUpRequest;
import com.orbitgard.dto.response.TopUpResponse;
import com.orbitgard.security.JwtPrincipal;
import com.orbitgard.service.TopUpService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/payments")
public class PaymentController {

    private final TopUpService topUpService;

    public PaymentController(TopUpService topUpService) {
        this.topUpService = topUpService;
    }

    @PostMapping("/topup")
    public ResponseEntity<TopUpResponse> topUp(
            @AuthenticationPrincipal JwtPrincipal principal,
            @Valid @RequestBody TopUpRequest request) {
        return ResponseEntity.ok(topUpService.initiate(principal.userId(), request));
    }
}
