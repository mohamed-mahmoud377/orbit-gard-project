package com.orbitgard.auth.service;

import com.orbitgard.auth.event.UserRegisteredEvent;
import com.orbitgard.dto.request.RegisterRequest;
import com.orbitgard.dto.response.FieldErrorResponse;
import com.orbitgard.dto.response.RegisterResponse;
import com.orbitgard.entity.User;
import com.orbitgard.exceptions.ErrorCode;
import com.orbitgard.exceptions.ValidationException;
import com.orbitgard.mapper.UserMapper;
import com.orbitgard.repository.UserRepository;
import com.orbitgard.validation.NameValidator;
import com.orbitgard.validation.PhoneNumberNormalizer;
import com.orbitgard.validation.UsernameNormalizer;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

@Service
public class SignupService {

    private static final Logger log = LoggerFactory.getLogger(SignupService.class);

    private static final int PASSWORD_MIN_LENGTH = 8;
    private static final int PASSWORD_MAX_LENGTH = 64;

    private final UserRepository userRepository;
    private final UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;
    private final ApplicationEventPublisher publisher;

    public SignupService(UserRepository userRepository, UserMapper userMapper, PasswordEncoder passwordEncoder , ApplicationEventPublisher publisher, EntityManager entityManager) {
        this.userRepository = userRepository;
        this.userMapper = userMapper;
        this.passwordEncoder = passwordEncoder;
        this.publisher = publisher;
    }

    @Transactional
    public RegisterResponse register(RegisterRequest request) {

        log.info("Starting registration request.");

        List<FieldErrorResponse> errors = new ArrayList<>();

        validateShape(request, errors);
        NormalizedInput normalized = normalizeInput(request, errors);
        throwIfErrors(errors);

        checkUniqueness(normalized, errors);
        throwIfErrors(errors);

        User saved = persistUser(request, normalized);
        scheduleActivationEmail(saved);

        return userMapper.toRegisterResponse(saved);
    }

    private void validateShape(RegisterRequest request, List<FieldErrorResponse> errors) {
        String firstName = trimOrEmpty(request.firstName());
        String lastName = trimOrEmpty(request.lastName());

        NameValidator.Status firstNameStatus = NameValidator.validate(firstName).status();

        if (firstNameStatus != NameValidator.Status.VALID) {
            log.warn("First name validation failed. Status={}", firstNameStatus);
            errors.add(FieldErrorResponse.builder()
                    .field("firstName")
                    .code(ErrorCode.NAME_INVALID.name())
                    .build());
        }

        NameValidator.Status lastNameStatus = NameValidator.validate(lastName).status();
        if (lastNameStatus != NameValidator.Status.VALID) {
            log.warn("Last name validation failed. Status={}", lastNameStatus);
            errors.add(FieldErrorResponse.builder()
                    .field("lastName")
                    .code(ErrorCode.NAME_INVALID.name())
                    .build());
        }

        if (!isValidPasswordShape(request.password())) {
            log.warn("Password failed validation.");
            errors.add(FieldErrorResponse.builder()
                    .field("password")
                    .code(ErrorCode.PASSWORD_TOO_WEAK.name())
                    .build());
        }

        if (request.password() != null
                && !request.password().equals(request.confirmPassword())) {

            log.warn("Password confirmation mismatch.");
            errors.add(FieldErrorResponse.builder()
                    .field("passwordConfirmation")
                    .code(ErrorCode.PASSWORD_MISMATCH.name())
                    .build());
        }
    }

    private NormalizedInput normalizeInput(RegisterRequest request, List<FieldErrorResponse> errors) {
        String normalizedUsername = UsernameNormalizer.normalize(request.username());
        if (!UsernameNormalizer.isValidFormat(normalizedUsername)) {
            log.warn("Username format validation failed.");
            errors.add(FieldErrorResponse.builder()
                    .field("username")
                    .code(ErrorCode.USERNAME_INVALID.name())
                    .build());
        }

        String normalizedEmail = request.email() == null ? null : request.email().trim().toLowerCase();

        PhoneNumberNormalizer.Result phoneResult = PhoneNumberNormalizer.normalize(request.phoneNumber());
        PhoneNumberNormalizer.Status phoneStatus = phoneResult.status();

        if (phoneStatus != PhoneNumberNormalizer.Status.VALID) {
            log.warn("Phone validation failed. Status={}", phoneStatus);
        }

        if (phoneStatus == PhoneNumberNormalizer.Status.INVALID) {
            errors.add(FieldErrorResponse.builder()
                    .field("phoneNumber")
                    .code(ErrorCode.PHONE_INVALID.name())
                    .build());
        } else if (phoneStatus == PhoneNumberNormalizer.Status.NOT_EGYPTIAN) {
            errors.add(FieldErrorResponse.builder()
                    .field("phoneNumber")
                    .code(ErrorCode.PHONE_NOT_EGYPTIAN.name())
                    .build());
        }

        return new NormalizedInput(normalizedUsername, normalizedEmail, phoneResult.canonicalNumber());
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

    private void scheduleActivationEmail(User saved) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                }
            });
        }

        return userMapper.toRegisterResponse(saved);
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
            errors.add(FieldErrorResponse.builder()
                    .field("username")
                    .code(ErrorCode.USERNAME_TAKEN.name())
                    .build());
        }
        if (lower.contains("email")) {
            errors.add(FieldErrorResponse.builder()
                    .field("email")
                    .code(ErrorCode.EMAIL_TAKEN.name())
                    .build());
        }
        if (lower.contains("phone")) {
            errors.add(FieldErrorResponse.builder()
                    .field("phoneNumber")
                    .code(ErrorCode.PHONE_TAKEN.name())
                    .build());
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
}