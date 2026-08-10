package com.orbitgard.service;


import com.orbitgard.dto.request.ChangePasswordRequest;
import com.orbitgard.dto.request.PasswordResetConfirmRequest;
import com.orbitgard.dto.request.PasswordResetRequest;
import com.orbitgard.dto.response.ChangePasswordResponse;
import com.orbitgard.dto.response.PasswordResetConfirmResponse;
import com.orbitgard.dto.response.PasswordResetRequestResponse;

public interface PasswordService {
    ChangePasswordResponse changePassword(ChangePasswordRequest request);
    int countActiveSessions();
    PasswordResetRequestResponse requestPasswordReset(PasswordResetRequest request);
    PasswordResetConfirmResponse confirmPasswordReset(PasswordResetConfirmRequest request);
}