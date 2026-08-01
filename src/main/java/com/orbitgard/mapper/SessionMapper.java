package com.orbitgard.mapper;

import com.orbitgard.auth.dto.response.LoginResponse;
import com.orbitgard.auth.dto.response.UserSummaryResponse;
import com.orbitgard.entity.Session;
import com.orbitgard.entity.User;

import java.net.InetAddress;
import java.time.OffsetDateTime;

public final class SessionMapper {

    private SessionMapper() {
    }

    public static LoginResponse toLoginResponse(User user, String accessToken, String refreshToken, long expiresInSeconds) {
        return LoginResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .tokenType("Bearer")
                .expiresIn(expiresInSeconds)
                .user(toUserSummary(user))
                .build();
    }

    public static UserSummaryResponse toUserSummary(User user) {
        return UserSummaryResponse.builder()
                .id(user.getId())
                .username(user.getUsername())
                .firstName(user.getFirstName())
                .lastName(user.getLastName())
                .accountType(user.getAccountType())
                .build();
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