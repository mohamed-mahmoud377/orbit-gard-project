package com.orbitgard.security;

import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;

@Component
public class RefreshTokenGenerator {

    private final JwtService jwtService;

    public RefreshTokenGenerator(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    public String generate(Long userId, Long sessionId, Instant expiresAt) {
        return jwtService.mintRefreshToken(userId, sessionId, expiresAt);
    }

    public String hash(String rawToken) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashBytes = digest.digest(rawToken.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hashBytes);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}