package com.orbitgard.service;

import com.orbitgard.entity.User;

public interface VerificationEmailService {
    void sendVerificationEmail(User user);
}