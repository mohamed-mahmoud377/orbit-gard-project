package com.orbitgard.dto.request;

import jakarta.validation.constraints.*;

import java.math.BigDecimal;

public record ExternalPayRequest(

        @NotBlank(message = "FIELD_REQUIRED")
        String verificationToken,

        @NotBlank(message = "FIELD_REQUIRED")
        @Size(max = 255, message = "MERCHANT_NAME_TOO_LONG")
        String merchantName,

        @NotBlank(message = "FIELD_REQUIRED")
        @Size(max = 255, message = "PRODUCT_NAME_TOO_LONG")
        String productName,

        @NotNull(message = "FIELD_REQUIRED")
        @Positive(message = "AMOUNT_INVALID")
        @Digits(integer = 12, fraction = 2, message = "AMOUNT_INVALID")
        BigDecimal cashAmount
) {
}