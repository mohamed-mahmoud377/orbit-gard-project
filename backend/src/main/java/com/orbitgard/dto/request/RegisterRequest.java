package com.orbitgard.dto.request;

import com.orbitgard.validation.annotation.ValidName;
import com.orbitgard.validation.annotation.ValidUsername;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Builder;

@Builder
public record RegisterRequest(

        @ValidName
        String firstName,

        @ValidName
        String lastName,

        @ValidUsername
        String username,

        @NotBlank(message = "FIELD_REQUIRED")
        @Email(message = "EMAIL_INVALID")
        @Size(max = 255, message = "EMAIL_INVALID")
        String email,

        @NotBlank(message = "FIELD_REQUIRED")
        String phoneNumber,

        @NotBlank(message = "FIELD_REQUIRED")
        @Size(min = 8, max = 64, message = "PASSWORD_TOO_WEAK")
        @Pattern(
                regexp = "^(?=.*[A-Za-z])(?=.*\\d).*$",
                message = "PASSWORD_TOO_WEAK"
        )
        String password,

        // Optional — validated and applied during registration (ORB-005)
        String promoCode

) {
    public RegisterRequest {
        if (promoCode != null && promoCode.isBlank()) {
            promoCode = null;
        }
    }
}
