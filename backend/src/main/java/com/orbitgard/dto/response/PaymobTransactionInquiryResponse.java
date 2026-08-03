package com.orbitgard.dto.response;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class PaymobTransactionInquiryResponse {
    private boolean success;
    private boolean pending;

    @JsonProperty("is_voided")
    private boolean isVoided;

    @JsonProperty("is_refunded")
    private boolean isRefunded;

    @JsonProperty("error_occured")
    private boolean errorOccured;

    @JsonProperty("amount_cents")
    private Integer amountCents;

    private String currency;
}
