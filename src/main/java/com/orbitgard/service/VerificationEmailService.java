package com.orbitgard.service;

import com.orbitgard.dto.auth.ResendVerificationResponse;
import com.orbitgard.entity.User;

public interface VerificationEmailService {
    void sendVerificationEmail(User user);
    ResendVerificationResponse resendVerification(String email);
}