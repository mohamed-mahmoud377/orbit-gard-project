package com.orbitgard.service.Impl;

import com.orbitgard.dto.request.UpdateProfileRequest;
import com.orbitgard.dto.response.FieldErrorResponse;
import com.orbitgard.dto.response.ProfileResponse;
import com.orbitgard.entity.User;
import com.orbitgard.exceptions.ErrorCode;
import com.orbitgard.exceptions.ValidationException;
import com.orbitgard.repository.UserRepository;
import com.orbitgard.service.AuthenticatedUserService;
import com.orbitgard.service.ProfileService;
import com.orbitgard.validation.PhoneNumberNormalizer;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.UUID;

@Service
public class ProfileServiceImpl implements ProfileService {

    private final UserRepository userRepository;
    private final AuthenticatedUserService currentUserProvider;
    private final Validator validator;

    public ProfileServiceImpl(UserRepository userRepository, AuthenticatedUserService currentUserProvider,
                              Validator validator) {
        this.userRepository = userRepository;
        this.currentUserProvider = currentUserProvider;
        this.validator = validator;
    }

    @Override
    public ProfileResponse get() {
        return toResponse(loadCurrentUser());
    }

    @Override
    @Transactional
    public ProfileResponse update(UpdateProfileRequest request) {
        User user = loadCurrentUser();

        List<FieldErrorResponse> errors = new ArrayList<>();
        String firstName = trim(request.firstName());
        String lastName = trim(request.lastName());

        addFieldErrors(errors, "firstName", firstName);
        addFieldErrors(errors, "lastName", lastName);

        PhoneNumberNormalizer.Result phoneResult = validatePhone(errors, user, request.phoneNumber());

        if (!errors.isEmpty()) {
            throw new ValidationException(errors);
        }

        applyChanges(user, firstName, lastName, phoneResult.canonicalNumber());

        try {
            // Flush now so a concurrent change to the same number is returned
            // as the documented phone-field error rather than a generic 500
            // after this method has returned.
            return toResponse(userRepository.saveAndFlush(user));
        } catch (DataIntegrityViolationException ex) {
            throw new ValidationException(List.of(
                    new FieldErrorResponse("phoneNumber", ErrorCode.PHONE_TAKEN.name())
            ));
        }
    }

    private User loadCurrentUser() {
        UUID userId = currentUserProvider.require().userId();
        return userRepository.findById(userId)
                .orElseThrow(() -> new NoSuchElementException("User not found: " + userId));
    }

    private void addFieldErrors(List<FieldErrorResponse> errors, String field, String value) {
        Set<ConstraintViolation<UpdateProfileRequest>> violations =
                validator.validateValue(UpdateProfileRequest.class, field, value);
        if (violations.isEmpty()) {
            return;
        }
        String code = violations.stream()
                .map(ConstraintViolation::getMessage)
                .filter(ErrorCode.FIELD_REQUIRED.name()::equals)
                .findFirst()
                // A value can violate both @Size and @Pattern. The form
                // should consistently show the length message first.
                .orElseGet(() -> violations.stream()
                        .map(ConstraintViolation::getMessage)
                        .filter(ErrorCode.NAME_TOO_LONG.name()::equals)
                        .findFirst()
                        .orElseGet(() -> violations.iterator().next().getMessage()));
        errors.add(new FieldErrorResponse(field, code));
    }

    private PhoneNumberNormalizer.Result validatePhone(List<FieldErrorResponse> errors, User user,
                                                        String rawPhoneNumber) {
        int before = errors.size();
        addFieldErrors(errors, "phoneNumber", rawPhoneNumber);
        if (errors.size() > before) {
            return PhoneNumberNormalizer.Result.invalid();
        }

        PhoneNumberNormalizer.Result result = PhoneNumberNormalizer.normalize(rawPhoneNumber);
        switch (result.status()) {
            case INVALID -> errors.add(new FieldErrorResponse("phoneNumber", ErrorCode.PHONE_INVALID.name()));
            case NOT_EGYPTIAN -> errors.add(new FieldErrorResponse("phoneNumber", ErrorCode.PHONE_NOT_EGYPTIAN.name()));
            case VALID -> {
                boolean unchanged = result.canonicalNumber().equals(user.getPhoneNumber());
                if (!unchanged && userRepository.existsByPhoneNumberAndIdNot(result.canonicalNumber(), user.getId())) {
                    errors.add(new FieldErrorResponse("phoneNumber", ErrorCode.PHONE_TAKEN.name()));
                }
            }
        }
        return result;
    }

    private void applyChanges(User user, String firstName, String lastName, String canonicalPhoneNumber) {
        user.setFirstName(firstName);
        user.setLastName(lastName);
        user.setPhoneNumber(canonicalPhoneNumber);
    }

    private ProfileResponse toResponse(User user) {
        return ProfileResponse.builder()
                .firstName(user.getFirstName())
                .lastName(user.getLastName())
                .username(user.getUsername())
                .phoneNumber(user.getPhoneNumber())
                .build();
    }

    private static String trim(String value) {
        return value == null ? "" : value.trim();
    }
}
