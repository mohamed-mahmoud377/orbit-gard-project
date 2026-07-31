package com.orbitgard.auth.service;

import com.orbitgard.auth.service.EmailVerificationService;
import org.springframework.stereotype.Service;

@Service
public class EmailVerificationServiceImpl
        implements EmailVerificationService {

    @Override
    public void sendVerificationEmail(
            String email,
            String verificationToken) {
        // TODO: Implement after verification service is merged
    }
}