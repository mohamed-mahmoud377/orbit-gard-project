package com.orbitgard.dto.response;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Response shape for GET /v1/transaction/{id}. Field names below are a
 * best-effort starting point based on Paymob's public docs snippets
 * ({"status": "successful", "amount": 1000, "currency": "EGP"}) — hit the
 * endpoint manually in Postman with a real transaction id and adjust field
 * names/types here to match exactly before relying on this in production.
 */
@Data
@NoArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class PaymobIntentionStatusResponse {

    private String id;

    /** Expected values seen in docs: "successful", "pending", "intended". Confirm the full set in Postman. */
    private String status;

    private Integer amount;

    private String currency;

    @JsonProperty("special_reference")
    private String specialReference;
}