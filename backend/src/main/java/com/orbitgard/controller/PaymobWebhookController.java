package com.orbitgard.controller;

import com.orbitgard.paymob.PaymobWebhookPayload;
import com.orbitgard.service.PaymentConfirmationService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.view.RedirectView;

@RestController
@RequestMapping("/payments/webhook")
@Slf4j
public class PaymobWebhookController {

    private final PaymentConfirmationService paymentConfirmationService;

    public PaymobWebhookController(PaymentConfirmationService paymentConfirmationService) {
        this.paymentConfirmationService = paymentConfirmationService;
    }

    @PostMapping("/paymob")
    public ResponseEntity<String> notification(@RequestBody PaymobWebhookPayload payload) {
        if (payload == null || payload.getObj() == null) {
            log.warn("Rejected Paymob webhook: missing payload object");
            return ResponseEntity.badRequest().body("missing obj");
        }

        try {
            paymentConfirmationService.reconcileFromWebhook(payload);
        } catch (Exception ex) {
            log.error("Error reconciling payment from webhook", ex);
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