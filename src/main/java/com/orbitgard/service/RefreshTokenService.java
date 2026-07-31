package com.orbitgard.service;

import com.orbitgard.dto.request.RefreshTokenRequest;
import com.orbitgard.dto.response.LoginResponse;
import com.orbitgard.entity.Session;
import com.orbitgard.enums.AccountType;
import com.orbitgard.enums.UserStatus;
import com.orbitgard.exceptions.ApiException;
import com.orbitgard.exceptions.ErrorCode;
import com.orbitgard.mapper.SessionMapper;
import com.orbitgard.repository.SessionRepository;
import com.orbitgard.security.JwtService;
import com.orbitgard.security.RefreshTokenGenerator;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;

@Service
public class RefreshTokenService {

    // Temporary Postman-test values. Original: 12 hours without Remember me; 7 days with it.
    private static final long STANDARD_IDLE_TIMEOUT_MINUTES = 6;
    private static final long REMEMBER_ME_IDLE_TIMEOUT_MINUTES = 8;

    private final SessionRepository sessionRepository;
    private final RefreshTokenGenerator refreshTokenGenerator;
    private final JwtService jwtService;

    public RefreshTokenService(SessionRepository sessionRepository,
                               RefreshTokenGenerator refreshTokenGenerator,
                               JwtService jwtService) {
        this.sessionRepository = sessionRepository;
        this.refreshTokenGenerator = refreshTokenGenerator;
        this.jwtService = jwtService;
    }

    /**
     * Rotates a refresh token and renews its idle window. The session's
     * absolute expiry is never extended: 24 hours normally, or 30 days when
     * the user selected Remember me.
     */
    @Transactional
    public LoginResponse refresh(RefreshTokenRequest request) {
        String tokenHash = refreshTokenGenerator.hash(request.refreshToken());
        Session session = sessionRepository.findByRefreshTokenHash(tokenHash)
                .orElseThrow(() -> new ApiException(ErrorCode.INVALID_REFRESH_TOKEN));
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);

        if (session.getRevokedAt() != null
                || !now.isBefore(session.getIdleExpiresAt())
                || !now.isBefore(session.getAbsoluteExpiresAt())
                || session.getUser().getStatus() != UserStatus.ACTIVE
                || session.getUser().getAccountType() != AccountType.USER) {
            throw new ApiException(ErrorCode.INVALID_REFRESH_TOKEN);
        }

        String replacementToken = refreshTokenGenerator.generate();
        session.setPreviousRefreshTokenHash(session.getRefreshTokenHash());
        session.setRefreshTokenHash(refreshTokenGenerator.hash(replacementToken));
        session.setLastUsedAt(now);
        OffsetDateTime renewedIdleExpiry = session.isRememberMe()
                ? now.plusMinutes(REMEMBER_ME_IDLE_TIMEOUT_MINUTES) // Original: 7 days
                : now.plusMinutes(STANDARD_IDLE_TIMEOUT_MINUTES); // Original: 12 hours
        session.setIdleExpiresAt(renewedIdleExpiry.isBefore(session.getAbsoluteExpiresAt())
                ? renewedIdleExpiry
                : session.getAbsoluteExpiresAt());

        String accessToken = jwtService.mintAccessToken(
                session.getUser().getId(),
                session.getUser().getUsername(),
                session.getUser().getAccountType(),
                session.getId());
        return SessionMapper.toLoginResponse(
                session.getUser(), accessToken, replacementToken, jwtService.accessTokenTtlSeconds());
    }
}
