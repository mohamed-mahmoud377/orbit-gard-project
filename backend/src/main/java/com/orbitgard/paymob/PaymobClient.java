package com.orbitgard.paymob;

import com.orbitgard.dto.request.PaymobIntentionRequest;
import com.orbitgard.dto.response.PaymobIntentionResponse;
import com.orbitgard.dto.response.PaymobIntentionStatusResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;

@Component
@Slf4j
public class PaymobClient {

    private final RestTemplate restTemplate;
    private final PaymobProperties props;

    public PaymobClient(@Qualifier("paymobRestTemplate") RestTemplate restTemplate, PaymobProperties props) {
        this.restTemplate = restTemplate;
        this.props = props;
    }

    /**
     * Creates the payment intention. Modern API, secretKey only.
     */
    public PaymobIntentionResponse createIntention(PaymobIntentionRequest request) {
        String url = props.getBaseUrl() + "/v1/intention/";
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.AUTHORIZATION, "Token " + props.getSecretKey());
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<PaymobIntentionRequest> entity = new HttpEntity<>(request, headers);

        try {
            ResponseEntity<PaymobIntentionResponse> response = restTemplate.exchange(
                    url,
                    HttpMethod.POST,
                    entity,
                    PaymobIntentionResponse.class
            );
            return response.getBody();
        } catch (HttpStatusCodeException ex) {
            log.error("Paymob create intention failed: {}", ex.getStatusCode());
            throw new IllegalStateException("Paymob failed to create intention: " + ex.getStatusCode(), ex);
        }
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
        String url = String.format("%s/v1/intention/element/%s/%s/", props.getBaseUrl(), props.getPublicKey(), clientSecret);
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.AUTHORIZATION, "Token " + props.getSecretKey());
        HttpEntity<Void> entity = new HttpEntity<>(headers);

        try {
            ResponseEntity<PaymobIntentionStatusResponse> response = restTemplate.exchange(
                    url,
                    HttpMethod.GET,
                    entity,
                    PaymobIntentionStatusResponse.class
            );
            return response.getBody();
        } catch (HttpStatusCodeException ex) {
            log.error("Paymob check intention status failed: {} - body: {}", ex.getStatusCode());
            throw new IllegalStateException("Paymob failed to check intention status: " + ex.getStatusCode(), ex);
        }
    }

    public String buildCheckoutRedirectUrl(String clientSecret) {
        return String.format("%s/unifiedcheckout/?publicKey=%s&clientSecret=%s",
                props.getBaseUrl(), props.getPublicKey(), clientSecret);
    }

}