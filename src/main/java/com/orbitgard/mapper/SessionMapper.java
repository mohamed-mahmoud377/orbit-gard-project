package com.orbitgard.mapper;

import com.orbitgard.dto.response.LoginResponse;
import com.orbitgard.dto.response.UserSummaryResponse;
import com.orbitgard.entity.Session;
import com.orbitgard.entity.User;

import java.net.InetAddress;
import java.time.OffsetDateTime;

public final class SessionMapper {

    private SessionMapper() {
    }

    public static LoginResponse toLoginResponse(User user, String accessToken, String refreshToken, long expiresInSeconds) {
        return new LoginResponse(
                accessToken,
                refreshToken,
                "Bearer",
                expiresInSeconds,
                toUserSummary(user)
        );
    }

    public static UserSummaryResponse toUserSummary(User user) {
        return new UserSummaryResponse(
                user.getId(),
                user.getUsername(),
                user.getFirstName(),
                user.getLastName(),
                user.getAccountType()
        );
    }

    public static Session toNewSession(
            User user,
            String refreshTokenHash,
            boolean rememberMe,
            String deviceLabel,
            String userAgent,
            InetAddress ipAddress,
            OffsetDateTime idleExpiresAt,
            OffsetDateTime absoluteExpiresAt
    ) {
        return Session.builder()
                .user(user)
                .refreshTokenHash(refreshTokenHash)
                .rememberMe(rememberMe)
                .deviceLabel(deviceLabel)
                .userAgent(userAgent)
                .ipAddress(ipAddress)
                .idleExpiresAt(idleExpiresAt)
                .absoluteExpiresAt(absoluteExpiresAt)
                .build();
    }
}