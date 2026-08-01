package com.orbitgard.auth.service;

import com.orbitgard.auth.dto.request.LoginRequest;
import com.orbitgard.auth.dto.response.LoginResponse;
import com.orbitgard.entity.Session;
import com.orbitgard.entity.User;
import com.orbitgard.enums.AccountType;
import com.orbitgard.enums.UserStatus;
import com.orbitgard.exceptions.ApiException;
import com.orbitgard.exceptions.ErrorCode;
import com.orbitgard.mapper.SessionMapper;
import com.orbitgard.repository.SessionRepository;
import com.orbitgard.repository.UserRepository;
import com.orbitgard.security.DeviceLabelResolver;
import com.orbitgard.security.JwtService;
import com.orbitgard.security.RefreshTokenGenerator;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.InetAddress;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Locale;
import java.util.Optional;

@Service
public class LoginService {

    private static final String DUMMY_PASSWORD_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

    private final UserRepository userRepository;
    private final SessionRepository sessionRepository;
    private final PasswordEncoder passwordEncoder;
    private final RefreshTokenGenerator refreshTokenGenerator;
    private final JwtService jwtService;
    private final DeviceLabelResolver deviceLabelResolver;

    public LoginService(UserRepository userRepository, SessionRepository sessionRepository,
                        PasswordEncoder passwordEncoder, RefreshTokenGenerator refreshTokenGenerator,
                        JwtService jwtService, DeviceLabelResolver deviceLabelResolver) {
        this.userRepository = userRepository;
        this.sessionRepository = sessionRepository;
        this.passwordEncoder = passwordEncoder;
        this.refreshTokenGenerator = refreshTokenGenerator;
        this.jwtService = jwtService;
        this.deviceLabelResolver = deviceLabelResolver;
    }

    @Transactional
    public LoginResponse login(LoginRequest request, String userAgent, InetAddress ipAddress) {
        String identifier = request.username().trim().toLowerCase(Locale.ROOT);
        Optional<User> user = userRepository.findByUsernameOrEmail(identifier, identifier);

        // Always compare against BCrypt, including when no account exists, to
        // avoid making account existence observable through response timing.
        boolean passwordMatches = passwordEncoder.matches(
                request.password(), user.map(User::getPasswordHash).orElse(DUMMY_PASSWORD_HASH));
        if (user.isEmpty() || !passwordMatches || user.get().getAccountType() != AccountType.USER) {
            throw new ApiException(ErrorCode.INVALID_CREDENTIALS);
        }

        User account = user.get();
        if (account.getStatus() == UserStatus.PENDING_VERIFICATION) {
            throw new ApiException(ErrorCode.ACCOUNT_NOT_VERIFIED);
        }
        if (account.getStatus() == UserStatus.SUSPENDED) {
            throw new ApiException(ErrorCode.ACCOUNT_SUSPENDED);
        }

        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        // Temporary Postman-test values. Production: Remember me = 7 days idle, 30 days absolute;
        // otherwise = 12 hours idle, 24 hours absolute.
        OffsetDateTime idleExpiresAt = request.rememberMe()
                ? now.plusMinutes(8) // Original: 7 days
                : now.plusMinutes(6); // Original: 12 hours
        OffsetDateTime absoluteExpiresAt = request.rememberMe()
                ? now.plusMinutes(10) // Original: 30 days
                : now.plusMinutes(7); // Original: 24 hours
        String refreshToken = refreshTokenGenerator.generate();

        Session session = SessionMapper.toNewSession(
                account,
                refreshTokenGenerator.hash(refreshToken),
                request.rememberMe(),
                truncate(deviceLabelResolver.resolve(userAgent), 120),
                truncate(userAgent, 400),
                ipAddress,
                idleExpiresAt,
                absoluteExpiresAt);
        Session savedSession = sessionRepository.save(session);

        String accessToken = jwtService.mintAccessToken(
                account.getId(), account.getUsername(), account.getAccountType(), savedSession.getId());
        return SessionMapper.toLoginResponse(account, accessToken, refreshToken, jwtService.accessTokenTtlSeconds());
    }

    private String truncate(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) {
            return value;
        }
        return value.substring(0, maxLength);
    }
}
