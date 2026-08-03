package com.orbitgard.paymob;

import com.orbitgard.dto.request.PaymobTransactionInquiryRequest;
import com.orbitgard.dto.response.PaymobAuthTokenResponse;
import com.orbitgard.dto.response.PaymobTransactionInquiryResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import com.orbitgard.dto.request.PaymobIntentionRequest;
import com.orbitgard.dto.response.PaymobIntentionResponse;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;

@Component
@Slf4j
public class PaymobClient {

    private final RestClient rest;
    private final PaymobProperties props;

    public PaymobClient(@Qualifier("paymobRestClient") RestClient rest, PaymobProperties props) {
        this.rest = rest;
        this.props = props;
    }

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

    public PaymobAuthTokenResponse getAuthToken() {
        return rest.post()
                .uri("/api/auth/tokens")
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("api_key", props.getApiKey()))
                .retrieve()
                .onStatus(HttpStatusCode::isError, errorHandler("authenticate"))
                .body(PaymobAuthTokenResponse.class);
    }

    public PaymobTransactionInquiryResponse inquireTransaction(String merchantOrderId, String token) {
        log.info("Inquiring Paymob transaction: merchantOrderId={}", merchantOrderId);
        return rest.post()
                .uri("/api/ecommerce/orders/transaction_inquiry")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .body(PaymobTransactionInquiryRequest.builder()
                        .merchantOrderId(merchantOrderId).build())
                .retrieve()
                .onStatus(HttpStatusCode::isError, errorHandler("inquire transaction"))
                .body(PaymobTransactionInquiryResponse.class);
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