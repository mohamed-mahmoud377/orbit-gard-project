package com.orbitgard.service;

import com.orbitgard.dto.response.ResendVerificationResponse;

public interface VerificationEmailService {
    void sendVerificationEmail(String email, String token);
    ResendVerificationResponse resendVerification(String email);
}
