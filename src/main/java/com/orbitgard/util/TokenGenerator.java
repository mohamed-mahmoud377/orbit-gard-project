package com.orbitgard.util;

import com.orbitgard.enums.TokenPurpose;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;

@Component
public class TokenGenerator {

    private static final String PURPOSE_CLAIM = "purpose";
    private static final String EMAIL_CLAIM = "email";

    private final SecretKey signingKey;

    public TokenGenerator(@Value("${app.jwt.secret}") String secret) {
        this.signingKey = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    public String generate(UUID userId, TokenPurpose purpose, String targetEmail, Duration validity) {
        Instant now = Instant.now();
        Instant expiresAt = now.plus(validity);

        return Jwts.builder()
                .id(UUID.randomUUID().toString())
                .subject(userId.toString())
                .claim(PURPOSE_CLAIM, purpose.name())
                .claim(EMAIL_CLAIM, targetEmail)
                .issuedAt(Date.from(now))
                .expiration(Date.from(expiresAt))
                .signWith(signingKey)
                .compact();
    }

    public Claims parseClaims(String token) {
        return Jwts.parser()
                .verifyWith(signingKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}