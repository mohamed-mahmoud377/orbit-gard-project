package com.orbitgard.dto.request;

import com.orbitgard.validation.annotation.ValidName;
import com.orbitgard.validation.annotation.ValidUsername;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Builder;

import java.math.BigDecimal;

@Builder
public record AddChildRequest(

        @ValidName
        String firstName,

        @ValidName
        String lastName,

        @ValidUsername
        String username,

        @NotBlank(message = "FIELD_REQUIRED")
        @Size(min = 8, max = 64, message = "PASSWORD_TOO_WEAK")
        @Pattern(
                regexp = "^(?=.*[A-Za-z])(?=.*\\d).*$",
                message = "PASSWORD_TOO_WEAK"
        )
        String password,

        @NotBlank(message = "FIELD_REQUIRED")
        String confirmPassword,

        @NotNull(message = "FIELD_REQUIRED")
        @DecimalMin(value = "0.01", message = "AMOUNT_INVALID")
        BigDecimal maxPerTransaction,

        @NotNull(message = "FIELD_REQUIRED")
        @DecimalMin(value = "0.01", message = "AMOUNT_INVALID")
        BigDecimal dailyLimit,

        @NotNull(message = "FIELD_REQUIRED")
        @DecimalMin(value = "0.01", message = "AMOUNT_INVALID")
        BigDecimal monthlyLimit,
        
        @DecimalMin(value = "0.01", message = "AMOUNT_INVALID")
        @DecimalMax(value = "100000.00", message = "AMOUNT_ABOVE_MAXIMUM")
        BigDecimal startingAllocation

) {}