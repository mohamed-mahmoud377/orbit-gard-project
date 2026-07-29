package com.orbitgard.security;

import com.orbitgard.enums.AccountType;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jws;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;

@Component
public class JwtService {

    private static final String CLAIM_TYPE = "type";
    private static final String TYPE_ACCESS = "access";
    private static final String TYPE_REFRESH = "refresh";

    private final SecretKey signingKey;
    private final long accessTokenTtlSeconds;

    public JwtService(
            @Value("${orbitgard.jwt.secret}") String secret,
            @Value("${orbitgard.jwt.access-token-ttl-seconds:900}") long accessTokenTtlSeconds
    ) {
        this.signingKey = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.accessTokenTtlSeconds = accessTokenTtlSeconds;
    }

    public String mintAccessToken(UUID userId, String username, AccountType accountType, UUID sessionId) {
        Instant now = Instant.now();
        Instant expiry = now.plusSeconds(accessTokenTtlSeconds);
        return Jwts.builder()
                .subject(String.valueOf(userId))
                .claim("username", username)
                .claim("accountType", accountType.name())
                .claim("sid", sessionId)
                .claim(CLAIM_TYPE, TYPE_ACCESS)
                .issuedAt(Date.from(now))
                .expiration(Date.from(expiry))
                .signWith(signingKey)
                .compact();
    }

    public String mintRefreshToken(UUID userId, UUID sessionId, Instant expiresAt) {
        return Jwts.builder()
                .subject(String.valueOf(userId))
                .claim("sid", sessionId)
                .claim(CLAIM_TYPE, TYPE_REFRESH)
                .issuedAt(Date.from(Instant.now()))
                .expiration(Date.from(expiresAt))
                .signWith(signingKey)
                .compact();
    }

    public Jws<Claims> parse(String token) {
        return Jwts.parser()
                .verifyWith(signingKey)
                .build()
                .parseSignedClaims(token);
    }

    public boolean isAccessToken(Jws<Claims> parsed) {
        return TYPE_ACCESS.equals(parsed.getPayload().get(CLAIM_TYPE, String.class));
    }

    public boolean isRefreshToken(Jws<Claims> parsed) {
        return TYPE_REFRESH.equals(parsed.getPayload().get(CLAIM_TYPE, String.class));
    }

    public long accessTokenTtlSeconds() {
        return accessTokenTtlSeconds;
    }
}
