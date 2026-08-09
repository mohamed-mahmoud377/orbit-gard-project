package com.orbitgard.service;


import com.orbitgard.dto.request.ChangePasswordRequest;
import com.orbitgard.dto.response.ChangePasswordResponse;

public interface PasswordService {
    ChangePasswordResponse changePassword(ChangePasswordRequest request);
    int countActiveSessions();
}