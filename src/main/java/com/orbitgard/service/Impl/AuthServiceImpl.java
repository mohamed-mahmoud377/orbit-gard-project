package com.orbitgard.service.Impl;

import com.orbitgard.dto.request.LoginRequest;
import com.orbitgard.dto.request.RegisterRequest;
import com.orbitgard.dto.response.*;
import com.orbitgard.entity.Session;
import com.orbitgard.entity.User;
import com.orbitgard.entity.VerificationToken;
import com.orbitgard.enums.AccountType;
import com.orbitgard.enums.TokenPurpose;
import com.orbitgard.enums.UserStatus;
import com.orbitgard.exceptions.ApiException;
import com.orbitgard.exceptions.ErrorCode;
import com.orbitgard.exceptions.ValidationException;
import com.orbitgard.mapper.SessionMapper;
import com.orbitgard.mapper.UserMapper;
import com.orbitgard.repository.SessionRepository;
import com.orbitgard.repository.UserRepository;
import com.orbitgard.repository.VerificationTokenRepository;
import com.orbitgard.security.DeviceLabelResolver;
import com.orbitgard.security.JwtService;
import com.orbitgard.security.RefreshTokenGenerator;
import com.orbitgard.service.AuthService;
import com.orbitgard.service.VerificationEmailService;
import com.orbitgard.util.TokenHasher;
import com.orbitgard.validation.PhoneNumberNormalizer;
import com.orbitgard.validation.UsernameNormalizer;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import jakarta.persistence.EntityManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.InetAddress;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

@Service
public class AuthServiceImpl implements AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthServiceImpl.class);

    private static final int PASSWORD_MIN_LENGTH = 8;
    private static final int PASSWORD_MAX_LENGTH = 64;
    private static final String DUMMY_PASSWORD_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

    // --- Shared / signup dependencies ---
    private final UserRepository userRepository;
    private final UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;
    private final EntityManager entityManager;
    private final JwtService jwtService;
    private final VerificationTokenRepository verificationTokenRepository;
    private final VerificationEmailService verificationEmailService;

    // --- Login dependencies ---
    private final SessionRepository sessionRepository;
    private final RefreshTokenGenerator refreshTokenGenerator;
    private final DeviceLabelResolver deviceLabelResolver;

    public AuthServiceImpl(UserRepository userRepository,
                           UserMapper userMapper,
                           PasswordEncoder passwordEncoder,
                           EntityManager entityManager,
                           JwtService jwtService,
                           VerificationTokenRepository verificationTokenRepository,
                           VerificationEmailService verificationEmailService,
                           SessionRepository sessionRepository,
                           RefreshTokenGenerator refreshTokenGenerator,
                           DeviceLabelResolver deviceLabelResolver) {
        this.userRepository = userRepository;
        this.userMapper = userMapper;
        this.passwordEncoder = passwordEncoder;
        this.entityManager = entityManager;
        this.jwtService = jwtService;
        this.verificationTokenRepository = verificationTokenRepository;
        this.verificationEmailService = verificationEmailService;
        this.sessionRepository = sessionRepository;
        this.refreshTokenGenerator = refreshTokenGenerator;
        this.deviceLabelResolver = deviceLabelResolver;
    }

    // =========================================================================
    // Registration
    // =========================================================================

    @Override
    @Transactional
    public RegisterResponse register(RegisterRequest request) {
        log.info("Starting registration request.");

        List<FieldErrorResponse> errors = new ArrayList<>();

        NormalizedInput normalized = normalizeInput(request, errors);
        throwIfErrors(errors);

        checkUniqueness(normalized, errors);
        throwIfErrors(errors);

        User saved = persistUser(request, normalized);
        String verificationToken = createVerificationToken(saved);
        try {
            verificationEmailService.sendVerificationEmail(saved.getEmail(), verificationToken);
        } catch (RuntimeException ex) {
            // Email is an external dependency. Keep the account and its stored
            // token so the user can request a new verification email later.
            log.error("Verification email delivery failed after registration. userId={}", saved.getId(), ex);
        }

        return userMapper.toRegisterResponse(saved);
    }


    private NormalizedInput normalizeInput(RegisterRequest request, List<FieldErrorResponse> errors) {
        String normalizedUsername = UsernameNormalizer.normalize(request.username());
        if (!UsernameNormalizer.isValidFormat(normalizedUsername)) {
            log.warn("Username format validation failed.");
            errors.add(new FieldErrorResponse("username", ErrorCode.USERNAME_INVALID.name()));
        }

        String normalizedEmail = request.email() == null ? null : request.email().trim().toLowerCase();

        PhoneNumberNormalizer.Result phoneResult = PhoneNumberNormalizer.normalize(request.phoneNumber());
        PhoneNumberNormalizer.Status phoneStatus = phoneResult.status();

        if (phoneStatus != PhoneNumberNormalizer.Status.VALID) {
            log.warn("Phone validation failed. Status={}", phoneStatus);
        }

        if (phoneStatus == PhoneNumberNormalizer.Status.INVALID) {
            errors.add(new FieldErrorResponse("phoneNumber", ErrorCode.PHONE_INVALID.name()));
        } else if (phoneStatus == PhoneNumberNormalizer.Status.NOT_EGYPTIAN) {
            errors.add(new FieldErrorResponse("phoneNumber", ErrorCode.PHONE_NOT_EGYPTIAN.name()));
        }

        return new NormalizedInput(normalizedUsername, normalizedEmail, phoneResult.canonicalNumber());
    }

    @Override
    public UsernameAvailabilityResponse checkUsernameAvailable(String username) {
        String normalized = UsernameNormalizer.normalize(username);

        boolean exists = userRepository.existsByUsername(normalized);

        return UsernameAvailabilityResponse.builder()
                .available(!exists)
                .message(exists ? ErrorCode.USERNAME_TAKEN.name() : null)
                .build();
    }

    private void checkUniqueness(NormalizedInput normalized, List<FieldErrorResponse> errors) {
        if (userRepository.existsByUsername(normalized.username())) {
            log.warn("Username already exists. username={}", normalized.username());
            errors.add(new FieldErrorResponse("username", ErrorCode.USERNAME_TAKEN.name()));
        }
        if (userRepository.existsByEmail(normalized.email())) {
            log.warn("Email already exists. email={}", normalized.email());
            errors.add(new FieldErrorResponse("email", ErrorCode.EMAIL_TAKEN.name()));
        }
        if (userRepository.existsByPhoneNumber(normalized.phone())) {
            log.warn("Phone number already exists. phone number={}", normalized.phone());
            errors.add(new FieldErrorResponse("phoneNumber", ErrorCode.PHONE_TAKEN.name()));
        }
    }

    private User persistUser(RegisterRequest request, NormalizedInput normalized) {
        String passwordHash = passwordEncoder.encode(request.password());

        User user = userMapper.toEntity(
                request,
                normalized.username(),
                normalized.email(),
                normalized.phone(),
                passwordHash
        );

        User saved;
        try {
            saved = userRepository.save(user);
            entityManager.flush();
            entityManager.refresh(saved);

            log.info(
                    "User registered successfully. userId={}, username={}",
                    saved.getId(),
                    saved.getUsername());
        } catch (DataIntegrityViolationException e) {
            log.warn(
                    "Database unique constraint violated during registration. constraint={}",
                    extractConstraintName(e));
            List<FieldErrorResponse> raceErrors = mapConstraintViolation(e);
            if (raceErrors.isEmpty()) {
                throw e;
            }
            throw new ValidationException(raceErrors);
        }

        return saved;
    }

    private String createVerificationToken(User user) {
        OffsetDateTime expiresAt = OffsetDateTime.now().plusHours(12);
        String rawToken = jwtService.mintEmailVerificationToken(user.getId(), user.getEmail(), expiresAt.toInstant());

        VerificationToken token = new VerificationToken();
        token.setUserId(user.getId());
        token.setTokenHash(TokenHasher.sha256Hex(rawToken));
        token.setPurpose(TokenPurpose.EMAIL_VERIFICATION);
        token.setTargetEmail(user.getEmail());
        token.setExpiresAt(expiresAt);
        verificationTokenRepository.saveAndFlush(token);

        return rawToken;
    }

    private boolean isValidPasswordShape(String password) {
        if (password == null) {
            return false;
        }
        if (password.length() < PASSWORD_MIN_LENGTH || password.length() > PASSWORD_MAX_LENGTH) {
            return false;
        }
        boolean hasLetter = password.chars().anyMatch(Character::isLetter);
        boolean hasDigit = password.chars().anyMatch(Character::isDigit);
        return hasLetter && hasDigit;
    }

    private String trimOrEmpty(String value) {
        return value == null ? "" : value.trim();
    }

    private List<FieldErrorResponse> mapConstraintViolation(DataIntegrityViolationException e) {
        List<FieldErrorResponse> errors = new ArrayList<>();
        String constraintName = extractConstraintName(e);
        if (constraintName == null) {
            return errors;
        }
        String lower = constraintName.toLowerCase(Locale.ROOT);
        if (lower.contains("username")) {
            errors.add(new FieldErrorResponse("username", ErrorCode.USERNAME_TAKEN.name()));
        }
        if (lower.contains("email")) {
            errors.add(new FieldErrorResponse("email", ErrorCode.EMAIL_TAKEN.name()));
        }
        if (lower.contains("phone")) {
            errors.add(new FieldErrorResponse("phoneNumber", ErrorCode.PHONE_TAKEN.name()));
        }
        return errors;
    }

    private String extractConstraintName(DataIntegrityViolationException e) {
        Throwable cause = e.getMostSpecificCause();
        if (cause instanceof org.hibernate.exception.ConstraintViolationException hibernateEx) {
            return hibernateEx.getConstraintName();
        }
        return null;
    }

    private void throwIfErrors(List<FieldErrorResponse> errors) {
        if (!errors.isEmpty()) {
            log.warn("Registration validation failed with {} error(s).", errors.size());
            throw new ValidationException(errors);
        }
    }

    private record NormalizedInput(String username, String email, String phone) {}

    // =========================================================================
    // Login
    // =========================================================================

    @Override
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

    // =========================================================================
    // Email verification
    // =========================================================================

    @Override
    @Transactional
    public VerifyEmailResponse verifyEmail(String rawToken) {

        Claims claims = parseClaims(rawToken);
        if (!TokenPurpose.EMAIL_VERIFICATION.name().equals(claims.get("purpose", String.class))) {
            throw new ApiException(ErrorCode.TOKEN_INVALID);
        }

        String hash = TokenHasher.sha256Hex(rawToken);

        VerificationToken token = verificationTokenRepository.findByTokenHash(hash)
                .orElseThrow(() -> new ApiException(ErrorCode.TOKEN_INVALID));

        if (token.getPurpose() != TokenPurpose.EMAIL_VERIFICATION) {
            throw new ApiException(ErrorCode.TOKEN_INVALID);
        }

        UUID userId = UUID.fromString(claims.getSubject());
        if (!token.getUserId().equals(userId)) {
            throw new ApiException(ErrorCode.TOKEN_INVALID);
        }

        User user = userRepository.findById(token.getUserId())
                .orElseThrow(() -> new ApiException(ErrorCode.TOKEN_INVALID));

        // Already active -> this is a repeat click. Return success, not an error.
        if (user.getStatus() == UserStatus.ACTIVE) {
            return new VerifyEmailResponse(user.getUsername(), user.getStatus(), token.getConsumedAt());
        }

        if (token.getConsumedAt() != null) {
            throw new ApiException(ErrorCode.TOKEN_ALREADY_USED);
        }

        if (token.getExpiresAt().isBefore(OffsetDateTime.now())) {
            throw new ApiException(ErrorCode.TOKEN_EXPIRED);
        }

        OffsetDateTime now = OffsetDateTime.now();
        user.setStatus(UserStatus.ACTIVE);
        token.setConsumedAt(now);

        userRepository.save(user);
        verificationTokenRepository.save(token);

        return new VerifyEmailResponse(user.getUsername(), user.getStatus(), now);
    }

    private Claims parseClaims(String rawToken) {
        try {
            return jwtService.parse(rawToken).getPayload();
        } catch (JwtException | IllegalArgumentException ex) {
            throw new ApiException(ErrorCode.TOKEN_INVALID);
        }
    }
}