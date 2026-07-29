package com.orbitgard.service;

import com.orbitgard.dto.auth.VerifyEmailResponse;

public interface AuthService {
    VerifyEmailResponse verifyEmail(String rawToken);
}