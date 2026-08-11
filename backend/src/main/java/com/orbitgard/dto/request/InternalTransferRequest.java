package com.orbitgard.dto.request;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public record InternalTransferRequest(
        @NotBlank String receiverUsername,
        @NotNull @DecimalMin(value = "0.01") @DecimalMax(value = "100000.00") BigDecimal amount
) {}