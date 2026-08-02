package com.orbitgard.mapper;

import com.orbitgard.dto.request.RegisterRequest;
import com.orbitgard.dto.response.RegisterResponse;
import com.orbitgard.entity.User;
import com.orbitgard.enums.AccountType;
import com.orbitgard.enums.UserStatus;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;

/**
 * Assembly only — no normalization and no hashing happens here.
 * SignupService must have already normalized the username/email/phone
 * and hashed the password before calling toEntity; this class just
 * puts the pieces together, so there's exactly one place that decides
 * what "normalized" means.
 *
 * Assumes entity.User exposes a builder (e.g. via Lombok's @Builder)
 * with property names matching the users table columns, and a plain
 * getter per column for toRegisterResponse. If User.java ends up
 * without a builder, or with different property names, update this
 * file to match.
 */
@Component
public final class UserMapper {

    private UserMapper() {
    }

    public User toEntity(
            RegisterRequest request,
            String normalizedUsername,
            String normalizedEmail,
            String canonicalPhoneNumber,
            String passwordHash
    ) {
        return User.builder()
                .accountType(AccountType.USER)
                .status(UserStatus.PENDING_VERIFICATION)
                .firstName(request.firstName().trim())
                .lastName(request.lastName().trim())
                .username(normalizedUsername)
                .email(normalizedEmail)
                .phoneNumber(canonicalPhoneNumber)
                .passwordHash(passwordHash)
                .promoCodeEntered(request.promoCode())
                .createdAt(OffsetDateTime.now(java.time.ZoneOffset.UTC))
                .updatedAt(OffsetDateTime.now(java.time.ZoneOffset.UTC))
                .build();
    }

    public RegisterResponse toRegisterResponse(User user) {
        return RegisterResponse.builder()
                .id(user.getId())
                .username(user.getUsername())
                .email(user.getEmail())
                .status(user.getStatus())
                .createdAt(user.getCreatedAt())
                .build();
    }
}