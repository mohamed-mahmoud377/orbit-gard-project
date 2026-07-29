package com.orbitgard.service;

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

/**
 * Orchestrates ORB-001 registration, in the exact step order the API
 * contract specifies:
 *
 * 1. Validate shape - collect every failure, never return on the first one.
 * 2. Normalise - lowercase username/email, canonical +20 phone.
 * 3. Check uniqueness against normalised values - again collect all three.
 * 4. Hash the password with BCrypt. The raw password is never stored or logged.
 * 5. Insert the row, status = PENDING_VERIFICATION, inside a transaction.
 * 6. Create the verification token in the same transaction.
 * 7. Commit.
 * 8. Send the email - after commit, never inside the transaction.
 */
@Service
public class SignupService {

    private static final Logger log = LoggerFactory.getLogger(SignupService.class);

    private static final int PASSWORD_MIN_LENGTH = 8;
    private static final int PASSWORD_MAX_LENGTH = 64;

    private final UserRepository userRepository;
    private final UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;

    public SignupService(UserRepository userRepository, UserMapper userMapper, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.userMapper = userMapper;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional
    public RegisterResponse register(RegisterRequest request) {

        log.info("Starting registration request.");
        // --- Step 1: shape validation. Collect every failure. ---
        List<FieldErrorResponse> errors = new ArrayList<>();

        String firstName = trimOrEmpty(request.firstName());
        String lastName = trimOrEmpty(request.lastName());

        NameValidator.Status firstNameStatus = NameValidator.validate(firstName).status();

        if (firstNameStatus != NameValidator.Status.VALID) {
            log.warn("First name validation failed. Status={}", firstNameStatus);
            errors.add(new FieldErrorResponse("firstName", ErrorCode.NAME_INVALID.name()));
        }
        NameValidator.Status lastNameStatus = NameValidator.validate(lastName).status();

        if (lastNameStatus != NameValidator.Status.VALID) {
            log.warn("Last name validation failed. Status={}", lastNameStatus);
            errors.add(new FieldErrorResponse("lastName", ErrorCode.NAME_INVALID.name()));
        }
        if (!isValidPasswordShape(request.password())) {
            log.warn("Password failed validation.");
            errors.add(new FieldErrorResponse("password", ErrorCode.PASSWORD_TOO_WEAK.name()));//changed to wrong temp error code
        }
        if (request.password() != null
                && !request.password().equals(request.confirmPassword())) {

            log.warn("Password confirmation mismatch.");
            errors.add(new FieldErrorResponse(
                    "passwordConfirmation",
                    ErrorCode.PASSWORD_MISMATCH.name()));//changed to wrong temp error code
        }

        // --- Step 2: normalise. Nothing is compared or stored before this point. ---
        String normalizedUsername = UsernameNormalizer.normalize(request.username());
        if (!UsernameNormalizer.isValidFormat(normalizedUsername)) {
            log.warn("Username format validation failed.");
            errors.add(new FieldErrorResponse("username", ErrorCode.USERNAME_INVALID.name()));
        }

        String normalizedEmail = request.email() == null ? null : request.email().trim().toLowerCase();

        PhoneNumberNormalizer.Result phoneResult =
                PhoneNumberNormalizer.normalize(request.phoneNumber());

        PhoneNumberNormalizer.Status phoneStatus = phoneResult.status();

        if (phoneStatus != PhoneNumberNormalizer.Status.VALID) {
            log.warn("Phone validation failed. Status={}", phoneStatus);
        }

        if (phoneStatus == PhoneNumberNormalizer.Status.INVALID) {
            errors.add(new FieldErrorResponse("phoneNumber", ErrorCode.PHONE_INVALID.name()));
        } else if (phoneStatus == PhoneNumberNormalizer.Status.NOT_EGYPTIAN) {
            errors.add(new FieldErrorResponse("phoneNumber", ErrorCode.PHONE_NOT_EGYPTIAN.name()));
        }

        // Shape/format failures stop here - uniqueness checks against bad
        // data would be meaningless.
        throwIfErrors(errors);

        String normalizedPhone = phoneResult.canonicalNumber();

        // --- Step 3: uniqueness against normalised values. Collect all three. ---
        if (userRepository.existsByUsername(normalizedUsername)) {
            log.warn("Username already exists. username={}", normalizedUsername);
            errors.add(new FieldErrorResponse("username", ErrorCode.USERNAME_TAKEN.name()));
        }
        if (userRepository.existsByEmail(normalizedEmail)) {
            log.warn("Email already exists. email={}", normalizedEmail);
            errors.add(new FieldErrorResponse("email", ErrorCode.EMAIL_TAKEN.name()));
        }
        if (userRepository.existsByPhoneNumber(normalizedPhone)) {
            log.warn("Phone number already exists. phone number={}", normalizedPhone);
            errors.add(new FieldErrorResponse("phoneNumber", ErrorCode.PHONE_TAKEN.name()));
        }

        throwIfErrors(errors);

        // --- Step 4: hash. Raw password never touches storage or logs from here on. ---
        String passwordHash = passwordEncoder.encode(request.password());

        // --- Step 5: insert, PENDING_VERIFICATION, inside this transaction. ---
        User user = userMapper.toEntity(
                request,
                normalizedUsername,
                normalizedEmail,
                normalizedPhone,
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
            // Someone else took the same username/email/phone in the gap
            // between our existsBy... checks above and this insert. The
            // pre-check is guidance, not a guarantee - this is the real
            // guarantee, enforced by the DB's own unique constraints.
            log.warn(
                    "Database unique constraint violated during registration. constraint={}",
                    extractConstraintName(e));
            List<FieldErrorResponse> raceErrors = mapConstraintViolation(e);
            if (raceErrors.isEmpty()) {
                // Not a uniqueness violation we recognise - let it surface
                // as a genuine 500 rather than mislabel it.
                throw e;
            }
            throw new ValidationException(raceErrors);
        }

        // --- Step 6: verification token, same transaction. ---
        // TODO: build once the verification_token entity/repository exist.
        // Generate a long random value, store only its hash (never the raw
        // token), purpose = EMAIL_VERIFICATION, targetEmail = normalizedEmail,
        // expiresAt = now + 12 hours.

        // TODO: promo code - request.promoCode() is stored only, not applied
        // at this stage. Storage location isn't specified by any document
        // reviewed so far (no promo_code column has been confirmed on the
        // users table) - needs a decision before this is wired in.

        // --- Step 7 & 8: commit happens when this method returns; the send
        // is registered to fire only after that commit succeeds, and never
        // runs at all if the transaction rolls back. ---
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    // TODO: call EmailService.sendActivationEmail(saved.getEmail(), token), Add Logging
                    // once EmailService and the verification token exist.
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

    /**
     * Maps a unique-constraint violation to the field(s) it actually
     * belongs to, by matching the constraint name Postgres/Hibernate
     * reports. ASSUMPTION: matches on the constraint name containing
     * "username" / "email" / "phone" - confirm this against your real
     * Flyway migration's actual constraint names (e.g. uq_users_username).
     * If your naming differs, adjust the substrings below.
     */
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
}