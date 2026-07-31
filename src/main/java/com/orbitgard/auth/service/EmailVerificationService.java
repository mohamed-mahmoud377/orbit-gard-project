package com.orbitgard.auth.service;

import com.orbitgard.entity.User;
import jakarta.validation.constraints.Email;

public interface EmailVerificationService {

    void sendVerificationEmail(String email, String verificationToken);
}