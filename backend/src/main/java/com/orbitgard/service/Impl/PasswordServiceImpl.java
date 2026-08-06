package com.orbitgard.service.Impl;

import com.orbitgard.dto.request.ChangePasswordRequest;
import com.orbitgard.dto.response.ChangePasswordResponse;
import com.orbitgard.entity.User;
import com.orbitgard.enums.SessionRevokedReason;
import com.orbitgard.exceptions.ApiException;
import com.orbitgard.exceptions.ErrorCode;
import com.orbitgard.repository.SessionRepository;
import com.orbitgard.repository.UserRepository;
import com.orbitgard.service.AuthenticatedUserService;
import com.orbitgard.service.PasswordService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.NoSuchElementException;
import java.util.UUID;

@Service
public class PasswordServiceImpl implements PasswordService {

    private final UserRepository userRepository;
    private final SessionRepository sessionRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticatedUserService authenticatedUserService;

    public PasswordServiceImpl(UserRepository userRepository,
                               SessionRepository sessionRepository,
                               PasswordEncoder passwordEncoder,
                               AuthenticatedUserService authenticatedUserService) {
        this.userRepository = userRepository;
        this.sessionRepository = sessionRepository;
        this.passwordEncoder = passwordEncoder;
        this.authenticatedUserService = authenticatedUserService;
    }

    @Override
    @Transactional
    public ChangePasswordResponse changePassword(ChangePasswordRequest request) {
        UUID userId = authenticatedUserService.currentPrincipal().userId();

        if (!request.newPassword().equals(request.confirmNewPassword())) {
            throw new ApiException(ErrorCode.PASSWORD_MISMATCH);
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
        sessionRepository.revokeAllActiveByUserId(userId, SessionRevokedReason.PASSWORD_CHANGE);

        return new ChangePasswordResponse(
                "Your password has been changed. Please sign in again.",
                deviceCount);
    }

    @Override
    public int countActiveSessions() {
        UUID userId = authenticatedUserService.currentPrincipal().userId();
        return sessionRepository.countByUserIdAndRevokedAtIsNull(userId);
    }
}