package com.orbitgard.controller;

import com.orbitgard.dto.request.ExternalPayRequest;
import com.orbitgard.dto.request.ExternalVerifyRequest;
import com.orbitgard.dto.response.ExternalPayResponse;
import com.orbitgard.dto.response.ExternalVerifyResponse;
import com.orbitgard.service.ExternalPaymentService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/external")
public class ExternalPaymentController {

    private final ExternalPaymentService externalPaymentService;

    public ExternalPaymentController(ExternalPaymentService externalPaymentService) {
        this.externalPaymentService = externalPaymentService;
    }

    @PostMapping("/verify")
    public ResponseEntity<ExternalVerifyResponse> verify(
            @Valid @RequestBody ExternalVerifyRequest request) {

        return ResponseEntity.ok(
                externalPaymentService.verify(request)
        );
    }

    @PostMapping("/pay")
    public ResponseEntity<ExternalPayResponse> pay(
            @Valid @RequestBody ExternalPayRequest request) {

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(externalPaymentService.pay(request));
    }
}