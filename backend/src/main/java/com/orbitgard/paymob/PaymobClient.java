package com.orbitgard.paymob;

import com.orbitgard.dto.request.PaymobIntentionRequest;
import com.orbitgard.dto.response.PaymobIntentionResponse;
import com.orbitgard.dto.response.PaymobIntentionStatusResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

@Component
@Slf4j
public class PaymobClient {

    private final RestClient rest;
    private final PaymobProperties props;

    public PaymobClient(@Qualifier("paymobRestClient") RestClient rest, PaymobProperties props) {
        this.rest = rest;
        this.props = props;
    }

    /**
     * Creates the payment intention. Modern API, secretKey only.
     */
    public PaymobIntentionResponse createIntention(PaymobIntentionRequest request) {
        return rest.post()
                .uri("/v1/intention/")
                .header(HttpHeaders.AUTHORIZATION, "Token " + props.getSecretKey())
                .contentType(MediaType.APPLICATION_JSON)
                .body(request)
                .retrieve()
                .onStatus(HttpStatusCode::isError, errorHandler("create intention"))
                .body(PaymobIntentionResponse.class);
    }

    /**
     * Actively asks Paymob for the current status of a transaction/intention.
     * Modern API, same secretKey as createIntention — replaces the legacy
     * apiKey/Bearer-token auth-then-inquire flow entirely.
     *
     * IMPORTANT: verify the exact response field names in Postman before
     * trusting this DTO — hit this endpoint manually with a real
     * intentionId first (see testing steps below).
     */
    public PaymobIntentionStatusResponse getIntentionStatus(String clientSecret) {
        log.info("Checking Paymob intention status via client_secret");
        return rest.get()
                .uri("/v1/intention/element/{publicKey}/{clientSecret}/", props.getPublicKey(), clientSecret)
                .retrieve()
                .onStatus(HttpStatusCode::isError, errorHandler("check intention status"))
                .body(PaymobIntentionStatusResponse.class);
    }

    public String buildCheckoutRedirectUrl(String clientSecret) {
        return String.format("%s/unifiedcheckout/?publicKey=%s&clientSecret=%s",
                props.getBaseUrl(), props.getPublicKey(), clientSecret);
    }

    private RestClient.ResponseSpec.ErrorHandler errorHandler(String action) {
        return (request, response) -> {
            String body;
            try {
                body = new String(response.getBody().readAllBytes(), StandardCharsets.UTF_8);
            } catch (IOException e) {
                body = "<unable to read response body>";
            }
            log.error("Paymob {} failed: {} {} - body: {}",
                    action, response.getStatusCode(), response.getStatusText(), body);
            throw new IllegalStateException("Paymob failed to " + action + ": " + response.getStatusCode());
        };
    }
}