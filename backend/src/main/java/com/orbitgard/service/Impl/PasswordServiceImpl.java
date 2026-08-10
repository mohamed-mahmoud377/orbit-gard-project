package com.orbitgard.service.Impl;

import com.orbitgard.dto.request.ChangePasswordRequest;
import com.orbitgard.dto.request.PasswordResetConfirmRequest;
import com.orbitgard.dto.request.PasswordResetRequest;
import com.orbitgard.dto.response.ChangePasswordResponse;
import com.orbitgard.dto.response.PasswordResetConfirmResponse;
import com.orbitgard.dto.response.PasswordResetRequestResponse;
import com.orbitgard.entity.User;
import com.orbitgard.entity.VerificationToken;
import com.orbitgard.enums.SessionRevokedReason;
import com.orbitgard.enums.TokenPurpose;
import com.orbitgard.exceptions.ApiException;
import com.orbitgard.exceptions.ErrorCode;
import com.orbitgard.repository.SessionRepository;
import com.orbitgard.repository.UserRepository;
import com.orbitgard.repository.VerificationTokenRepository;
import com.orbitgard.security.JwtService;
import com.orbitgard.service.AuthenticatedUserService;
import com.orbitgard.service.PasswordService;
import com.orbitgard.service.VerificationEmailService;
import com.orbitgard.util.TokenHasher;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import io.jsonwebtoken.ExpiredJwtException;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.*;

@Service
public class PasswordServiceImpl implements PasswordService {

    private static final String RESET_REQUESTED_MESSAGE =
            "If an account exists for that address, a reset link is on its way.";
    private static final String DUMMY_PASSWORD_HASH =
            "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

    private final UserRepository userRepository;
    private final SessionRepository sessionRepository;
    private final VerificationTokenRepository verificationTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticatedUserService authenticatedUserService;
    private final VerificationEmailService verificationEmailService;
    private final JwtService jwtService;

    public PasswordServiceImpl(UserRepository userRepository,
                               SessionRepository sessionRepository,
                               PasswordEncoder passwordEncoder,
                               AuthenticatedUserService authenticatedUserService,
                               JwtService jwtService,
                               VerificationTokenRepository verificationTokenRepository,
                               VerificationEmailService verificationEmailService) {
        this.userRepository = userRepository;
        this.sessionRepository = sessionRepository;
        this.verificationTokenRepository= verificationTokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.authenticatedUserService = authenticatedUserService;
        this.jwtService = jwtService;
        this.verificationEmailService = verificationEmailService;
    }

    @Override
    @Transactional
    public ChangePasswordResponse changePassword(ChangePasswordRequest request) {
        UUID userId = authenticatedUserService.currentPrincipal().userId();

        if (!request.newPassword().equals(request.confirmNewPassword())) {
            throw new ApiException(ErrorCode.PASSWORD_CONFIRMATION_MISMATCH);
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new NoSuchElementException("User not found: " + userId));

        if (!passwordEncoder.matches(request.currentPassword(), user.getPasswordHash())) {
            throw new ApiException(ErrorCode.INVALID_CURRENT_PASSWORD);
        }

        if (passwordEncoder.matches(request.newPassword(), user.getPasswordHash())) {
            throw new ApiException(ErrorCode.PASSWORD_REUSE);
        }

        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        userRepository.save(user);

        int deviceCount = sessionRepository.countByUserIdAndRevokedAtIsNull(userId);
        sessionRepository.revokeAllActiveByUserId(
                userId,
                SessionRevokedReason.PASSWORD_CHANGE,
                OffsetDateTime.now(ZoneOffset.UTC)
        );

        return new ChangePasswordResponse(
                "Your password has been changed. Please sign in again.",
                deviceCount);
    }

    @Override
    public int countActiveSessions() {
        UUID userId = authenticatedUserService.currentPrincipal().userId();
        return sessionRepository.countByUserIdAndRevokedAtIsNull(userId);
    }



    @Override
    public PasswordResetRequestResponse requestPasswordReset(PasswordResetRequest request) {
        String email = request.email().trim().toLowerCase(Locale.ROOT);
        Optional<User> user = userRepository.findByEmail(email);

        if (user.isPresent()) {
            issueResetToken(user.get());
        } else {
            performDummyWork();
        }

        return new PasswordResetRequestResponse(RESET_REQUESTED_MESSAGE);
    }

    private void issueResetToken(User user) {
        // 1. Supersede any live tokens first
        List<VerificationToken> liveTokens = verificationTokenRepository
                .findByUserIdAndPurposeAndConsumedAtIsNull(user.getId(), TokenPurpose.PASSWORD_RESET);

        OffsetDateTime now = OffsetDateTime.now();
        liveTokens.forEach(t -> t.setConsumedAt(now));
        verificationTokenRepository.saveAll(liveTokens);

        // 2. Decide the expiry window before minting, since the token itself needs it
        OffsetDateTime expiresAt = now.plusMinutes(30);

        // 3. THIS LINE — mint the raw token
        String rawToken = jwtService.mintPasswordResetToken(
                user.getId(), user.getEmail(), expiresAt.toInstant());

        // 4. Hash it — only the hash gets persisted, never the raw token
        String hash = TokenHasher.sha256Hex(rawToken);

        // 5. Persist the token row
        VerificationToken token = new VerificationToken();
        token.setUserId(user.getId());
        token.setTokenHash(hash);
        token.setPurpose(TokenPurpose.PASSWORD_RESET);
        token.setTargetEmail(user.getEmail());
        token.setExpiresAt(expiresAt);
        verificationTokenRepository.saveAndFlush(token);

        // 6. Only now send the email, with the RAW token embedded in the link
        verificationEmailService.sendPasswordResetEmail(user.getEmail(), rawToken);
    }

    private void performDummyWork() {
        passwordEncoder.matches("dummy-password-for-timing-safety", DUMMY_PASSWORD_HASH);
    }

    @Override
    @Transactional
    public PasswordResetConfirmResponse confirmPasswordReset(PasswordResetConfirmRequest request) {

        if (!request.newPassword().equals(request.confirmNewPassword())) {
            throw new ApiException(ErrorCode.PASSWORD_CONFIRMATION_MISMATCH);
        }

        Claims claims = parseResetClaims(request.token());

        String hash = TokenHasher.sha256Hex(request.token());
        VerificationToken token = verificationTokenRepository.findByTokenHash(hash)
                .orElseThrow(() -> new ApiException(ErrorCode.TOKEN_INVALID));

        if (token.getPurpose() != TokenPurpose.PASSWORD_RESET) {
            throw new ApiException(ErrorCode.TOKEN_INVALID);
        }

        UUID userId = UUID.fromString(claims.getSubject());
        if (!token.getUserId().equals(userId)) {
            throw new ApiException(ErrorCode.TOKEN_INVALID);
        }

        if (token.getExpiresAt().isBefore(OffsetDateTime.now())) {
            throw new ApiException(ErrorCode.TOKEN_EXPIRED);
        }

        User user = userRepository.findById(token.getUserId())
                .orElseThrow(() -> new ApiException(ErrorCode.TOKEN_INVALID));

        if (token.getConsumedAt() != null) {
            throw new ApiException(ErrorCode.TOKEN_ALREADY_USED);
        }



        if (passwordEncoder.matches(request.newPassword(), user.getPasswordHash())) {
            throw new ApiException(ErrorCode.PASSWORD_REUSE);
        }

        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);

        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        userRepository.save(user);

        token.setConsumedAt(now);
        verificationTokenRepository.save(token);

        sessionRepository.revokeAllActiveByUserId(userId, SessionRevokedReason.PASSWORD_RESET, now);

        return new PasswordResetConfirmResponse(
                "Your password is updated. You can now sign in with your new password.");
    }

    private Claims parseResetClaims(String rawToken) {
        try {
            Claims claims = jwtService.parse(rawToken).getPayload();

            if (!TokenPurpose.PASSWORD_RESET.name()
                    .equals(claims.get("purpose", String.class))) {
                throw new ApiException(ErrorCode.TOKEN_INVALID);
            }

            return claims;

        } catch (ExpiredJwtException ex) {
            throw new ApiException(ErrorCode.TOKEN_EXPIRED);

        } catch (JwtException | IllegalArgumentException ex) {
            throw new ApiException(ErrorCode.TOKEN_INVALID);
        }
    }
}
