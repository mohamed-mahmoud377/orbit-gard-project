package com.orbitgard.controller;

import com.orbitgard.entity.Payment;
import com.orbitgard.repository.PaymentRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/payments")
@Slf4j
public class PaymentStatusController {

    private final PaymentRepository paymentRepository;

    public PaymentStatusController(PaymentRepository paymentRepository) {
        this.paymentRepository = paymentRepository;
    }

    @GetMapping("/{paymentId}/status")
    public ResponseEntity<PaymentStatusResponse> getStatus(@PathVariable UUID paymentId) {
        return paymentRepository.findById(paymentId)
                .map(p -> ResponseEntity.ok(new PaymentStatusResponse(p.getId(), p.getStatus().name())))
                .orElse(ResponseEntity.notFound().build());
    }

    public record PaymentStatusResponse(UUID paymentId, String status) {}
}