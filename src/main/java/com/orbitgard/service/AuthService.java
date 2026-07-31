package com.orbitgard.service;

import com.orbitgard.dto.response.VerifyEmailResponse;

public interface AuthService {
    VerifyEmailResponse verifyEmail(String rawToken);
}