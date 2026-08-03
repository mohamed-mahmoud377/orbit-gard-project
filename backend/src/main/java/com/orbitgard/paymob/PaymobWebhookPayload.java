package com.orbitgard.paymob;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class PaymobWebhookPayload {

    private PaymobWebhookObj obj;
    private String type;

    @Data
    @NoArgsConstructor
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class PaymobWebhookObj {
        private long id;
        private boolean pending;
        private boolean success;
        private String currency;

        @JsonProperty("amount_cents")
        private int amountCents;

        @JsonProperty("is_auth")
        private boolean isAuth;

        @JsonProperty("is_capture")
        private boolean isCapture;

        @JsonProperty("is_standalone_payment")
        private boolean isStandalonePayment;

        @JsonProperty("is_voided")
        private boolean isVoided;

        @JsonProperty("is_refunded")
        private boolean isRefunded;

        @JsonProperty("is_3d_secure")
        private boolean is3dSecure;

        @JsonProperty("error_occured")
        private boolean errorOccured;

        @JsonProperty("integration_id")
        private Long integrationId;

        @JsonProperty("has_parent_transaction")
        private boolean hasParentTransaction;

        @JsonProperty("created_at")
        private String createdAt;

        private String owner;

        private PaymobOrder order;

        @JsonProperty("source_data")
        private SourceData sourceData;
    }

    @Data
    @NoArgsConstructor
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class PaymobOrder {
        private long id;

        @JsonProperty("merchant_order_id")
        private String merchantOrderId;
    }

    @Data
    @NoArgsConstructor
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class SourceData {
        private String pan;
        private String type;

        @JsonProperty("sub_type")
        private String subType;
    }
}
