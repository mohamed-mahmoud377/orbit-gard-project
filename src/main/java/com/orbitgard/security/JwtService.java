package com.orbitgard.security;

import com.orbitgard.enums.AccountType;
import com.orbitgard.enums.TokenPurpose;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtBuilder;
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
    private static final String CLAIM_USERNAME = "username";
    private static final String CLAIM_ACCOUNT_TYPE = "accountType";
    private static final String CLAIM_SID = "sid";
    private static final String CLAIM_PURPOSE = "purpose";
    private static final String CLAIM_EMAIL = "email";
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
        return baseBuilder(userId, sessionId, TYPE_ACCESS, now, expiry)
                .claim(CLAIM_USERNAME, username)
                .claim(CLAIM_ACCOUNT_TYPE, accountType.name())
                .compact();
    }

    public String mintRefreshToken(UUID userId, UUID sessionId, Instant expiresAt) {
        return baseBuilder(userId, sessionId, TYPE_REFRESH, Instant.now(), expiresAt)
                .compact();
    }

    public String mintEmailVerificationToken(UUID userId, String email, Instant expiresAt) {
        Instant now = Instant.now();
        return Jwts.builder()
                .id(UUID.randomUUID().toString())
                .subject(userId.toString())
                .claim(CLAIM_PURPOSE, TokenPurpose.EMAIL_VERIFICATION.name())
                .claim(CLAIM_EMAIL, email)
                .issuedAt(Date.from(now))
                .expiration(Date.from(expiresAt))
                .signWith(signingKey)
                .compact();
    }

    /**
     * Every token -- access or refresh -- shares the same subject, session id,
     * type claim, issued/expiry timestamps, and signing key. Only the extra
     * claims layered on top by each mint method differ. Keeping this in one
     * place means a change to the shared shape only has to happen once, and
     * both token types stay in sync automatically.
     */
    private JwtBuilder baseBuilder(UUID userId, UUID sessionId, String type, Instant issuedAt, Instant expiresAt) {
        return Jwts.builder()
                .subject(String.valueOf(userId))
                .claim(CLAIM_SID, sessionId)
                .claim(CLAIM_TYPE, type)
                .issuedAt(Date.from(issuedAt))
                .expiration(Date.from(expiresAt))
                .signWith(signingKey);
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
