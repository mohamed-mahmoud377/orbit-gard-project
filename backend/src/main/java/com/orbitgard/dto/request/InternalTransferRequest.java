package com.orbitgard.dto.request;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

@Schema(description = "Request to move money from the authenticated user's wallet to another Orbit user's wallet (ORB-011).")
public record InternalTransferRequest(

        @Schema(description = "Username of the Orbit user receiving the money.", example = "hanya.essam")
        @NotBlank
        String receiverUsername,

        @Schema(description = "Amount to send, in EGP, exact to two decimal places.", example = "100.00", minimum = "0.01", maximum = "100000.00")
        @NotNull
        @DecimalMin(value = "0.01")
        @DecimalMax(value = "100000.00")
        BigDecimal amount

) {}