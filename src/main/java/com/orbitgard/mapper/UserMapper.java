package com.orbitgard.mapper;

import com.orbitgard.dto.request.RegisterRequest;
import com.orbitgard.dto.response.RegisterResponse;
import com.orbitgard.entity.User;
import com.orbitgard.enums.AccountType;
import com.orbitgard.enums.UserStatus;

/**
 * Assembly only — no normalization and no hashing happens here.
 * SignupService must have already normalized the username/email/phone
 * and hashed the password before calling toEntity; this class just
 * puts the pieces together, so there's exactly one place that decides
 * what "normalized" means.
 *
 * Assumes entity.User exposes standard getters/setters matching the
 * users table columns (see the Flyway migration). If User.java ends
 * up with different member names, update this file to match.
 */
public final class UserMapper {

    private UserMapper() {
    }

    public static User toEntity(
            RegisterRequest request,
            String normalizedUsername,
            String normalizedEmail,
            String canonicalPhoneNumber,
            String passwordHash
    ) {
        User user = new User();
        user.setAccountType(AccountType.USER);
        user.setStatus(UserStatus.PENDING_VERIFICATION);
        user.setFirstName(request.firstName().trim());
        user.setLastName(request.lastName().trim());
        user.setUsername(normalizedUsername);
        user.setEmail(normalizedEmail);
        user.setPhoneNumber(canonicalPhoneNumber);
        user.setPasswordHash(passwordHash);
        user.setPromoCodeEntered(request.promoCode());
        // parent_id stays null — only CHILD accounts set it.
        return user;
    }

    public static RegisterResponse toRegisterResponse(User user) {
        return new RegisterResponse(
                user.getId(),
                user.getUsername(),
                user.getEmail(),
                user.getStatus(),
                user.getCreatedAt()
        );
    }
}
