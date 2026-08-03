package com.orbitgard.paymob;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;

@Component
@Slf4j
public class PaymobSignatureVerifier {

    private final String hmacSecret;

    public PaymobSignatureVerifier(PaymobProperties properties) {
        this.hmacSecret = properties.getHmacSecret();
    }

    public boolean verify(PaymobWebhookPayload.PaymobWebhookObj obj, String providedHmac) {
        if (hmacSecret == null || hmacSecret.isBlank() || providedHmac == null || obj == null) {
            log.warn("Cannot verify Paymob HMAC: missing secret, signature or payload");
            return false;
        }
        try {
            String computed = hex(hmac(concatenate(obj)));
            boolean ok = MessageDigest.isEqual(
                    computed.getBytes(StandardCharsets.UTF_8),
                    providedHmac.trim().toLowerCase().getBytes(StandardCharsets.UTF_8));
            if (!ok) {
                log.warn("Paymob HMAC mismatch for transaction id={}", obj.getId());
            }
            return ok;
        } catch (Exception e) {
            log.error("Error verifying Paymob HMAC", e);
            return false;
        }
    }

    private String concatenate(PaymobWebhookPayload.PaymobWebhookObj o) {
        var src = o.getSourceData();
        return new StringBuilder()
                .append(o.getAmountCents())
                .append(o.getCreatedAt())
                .append(o.getCurrency())
                .append(o.isErrorOccured())
                .append(o.isHasParentTransaction())
                .append(o.getId())
                .append(o.getIntegrationId())
                .append(o.is3dSecure())
                .append(o.isAuth())
                .append(o.isCapture())
                .append(o.isRefunded())
                .append(o.isStandalonePayment())
                .append(o.isVoided())
                .append(o.getOrder() == null ? "" : o.getOrder().getId())
                .append(o.getOwner())
                .append(o.isPending())
                .append(src == null ? "" : src.getPan())
                .append(src == null ? "" : src.getSubType())
                .append(src == null ? "" : src.getType())
                .append(o.isSuccess())
                .toString();
    }

    private byte[] hmac(String data) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA512");
        mac.init(new SecretKeySpec(hmacSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA512"));
        return mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
    }

    private String hex(byte[] bytes) {
        return HexFormat.of().formatHex(bytes);
    }
}
