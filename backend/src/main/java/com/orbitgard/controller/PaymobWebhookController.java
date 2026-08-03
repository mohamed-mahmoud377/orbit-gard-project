package com.orbitgard.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orbitgard.paymob.PaymobSignatureVerifier;
import com.orbitgard.paymob.PaymobWebhookPayload;
import com.orbitgard.service.PaymentConfirmationService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.view.RedirectView;

import java.util.UUID;

@RestController
@RequestMapping("/payments/webhook")
@Slf4j
public class PaymobWebhookController {

    private final PaymentConfirmationService paymentConfirmationService;
    private final PaymobSignatureVerifier signatureVerifier;
    private final ObjectMapper objectMapper;

    public PaymobWebhookController(PaymentConfirmationService paymentConfirmationService,
                                   PaymobSignatureVerifier signatureVerifier,
                                   ObjectMapper objectMapper) {
        this.paymentConfirmationService = paymentConfirmationService;
        this.signatureVerifier = signatureVerifier;
        this.objectMapper = objectMapper;
    }

    @PostMapping("/paymob")
    public ResponseEntity<String> notification(
            @RequestBody String rawBody,
            @RequestParam(value = "hmac", required = false) String hmacParam,
            @RequestHeader(value = "hmac", required = false) String hmacHeader) {
        String signature = hmacParam != null ? hmacParam : hmacHeader;

        PaymobWebhookPayload payload;
        try {
            payload = objectMapper.readValue(rawBody, PaymobWebhookPayload.class);
        } catch (Exception ex) {
            log.warn("Rejected Paymob webhook: unparseable body");
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("unparseable body");
        }

        if (payload.getObj() == null || !signatureVerifier.verify(payload.getObj(), signature)) {
            log.warn("Rejected Paymob webhook: invalid or missing HMAC");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("invalid signature");
        }

        String merchantOrderId = payload.getObj().getOrder() == null
                ? null
                : payload.getObj().getOrder().getMerchantOrderId();

        if (merchantOrderId == null) {
            log.warn("Paymob webhook missing merchant_order_id");
            return ResponseEntity.ok("OK");
        }

        try {
            paymentConfirmationService.reconcile(UUID.fromString(merchantOrderId));
        } catch (Exception ex) {
            log.error("Error reconciling payment from webhook, merchantOrderId={}", merchantOrderId, ex);
        }

        return ResponseEntity.ok("OK");
    }

    @GetMapping("/paymob")
    public RedirectView browserReturn(@RequestParam("merchant_order_id") String merchantOrderId) {
        try {
            paymentConfirmationService.reconcile(UUID.fromString(merchantOrderId));
        } catch (Exception ex) {
            log.error("Error reconciling payment from browser return, merchantOrderId={}", merchantOrderId, ex);
        }
        return new RedirectView("/wallet/topup/confirming?paymentId=" + merchantOrderId);
    }
}
