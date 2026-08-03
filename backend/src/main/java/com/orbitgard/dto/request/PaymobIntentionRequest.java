package com.orbitgard.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PaymobIntentionRequest {

    private int amount;
    private String currency;

    @JsonProperty("redirection_url")
    private String redirectionUrl;

    @JsonProperty("notification_url")
    private String notificationUrl;

    @JsonProperty("payment_methods")
    private List<Integer> paymentMethods;

    @JsonProperty("billing_data")
    private BillingData billingData;

    private Customer customer;

    @JsonProperty("special_reference")
    private String specialReference;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class BillingData {
        @JsonProperty("first_name")
        private String firstName;

        @JsonProperty("last_name")
        private String lastName;

        @JsonProperty("phone_number")
        private String phoneNumber;

        private String email;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Customer {
        @JsonProperty("first_name")
        private String firstName;

        @JsonProperty("last_name")
        private String lastName;

        private String email;
    }
}
