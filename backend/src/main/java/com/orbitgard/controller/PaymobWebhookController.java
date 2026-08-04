package com.orbitgard.controller;

import com.fasterxml.jackson.databind.ObjectMapper;

import com.orbitgard.paymob.PaymobWebhookPayload;
import com.orbitgard.service.PaymentConfirmationService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
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
    private final ObjectMapper objectMapper;

    public PaymobWebhookController(PaymentConfirmationService paymentConfirmationService,
                                   ObjectMapper objectMapper) {
        this.paymentConfirmationService = paymentConfirmationService;
        this.objectMapper = objectMapper;
    }

    @PostMapping("/paymob")
    public ResponseEntity<String> notification(@RequestBody String rawBody) {

        PaymobWebhookPayload payload;
        try {
            payload = objectMapper.readValue(rawBody, PaymobWebhookPayload.class);
        } catch (Exception ex) {
            log.warn("Rejected Paymob webhook: unparseable body");
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("unparseable body");
        }

        if (payload.getObj() == null) {
            log.warn("Rejected Paymob webhook: missing obj in payload");
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("missing obj");
        }

        var obj = payload.getObj();
        String merchantOrderId = obj.getOrder() == null ? null : obj.getOrder().getMerchantOrderId();

        if (merchantOrderId == null) {
            log.warn("Paymob webhook missing merchant_order_id");
            return ResponseEntity.ok("OK");
        }

        try {
            UUID paymentId = UUID.fromString(merchantOrderId);
            paymentConfirmationService.reconcileFromWebhook(
                    paymentId, obj.isSuccess(), obj.isPending(), obj.getAmountCents());
        } catch (Exception ex) {
            log.error("Error reconciling payment from webhook, merchantOrderId={}", merchantOrderId, ex);
        }

        return ResponseEntity.ok("OK");
    }

    @GetMapping("/paymob")
    public RedirectView browserReturn(@RequestParam(value = "merchant_order_id", required = false) String merchantOrderId,
                                      @RequestParam(value = "id", required = false) String transactionId) {
        // This is a browser redirect, not the webhook -- there's no JSON body here,
        // only whatever query params Paymob appends to the redirection_url.
        // It can't reliably tell us success/pending/amount, so its only job is
        // getting the user to the right page. The POST webhook above is what
        // actually flips the payment's status.
        log.info("Browser return: merchant_order_id={}, id={}", merchantOrderId, transactionId);

        if (merchantOrderId != null) {
            return new RedirectView("/wallet/topup/confirming?paymentId=" + merchantOrderId);
        }
        return new RedirectView("/wallet/topup/confirming?transactionId=" + transactionId);
    }
}