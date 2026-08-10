package com.orbitgard.service;

import com.orbitgard.dto.request.LoginRequest;
import com.orbitgard.dto.request.RegisterRequest;
import com.orbitgard.dto.response.LoginResponse;
import com.orbitgard.dto.response.PromoCodeValidationResponse;
import com.orbitgard.dto.response.RegisterResponse;
import com.orbitgard.dto.response.UsernameAvailabilityResponse;
import com.orbitgard.dto.response.VerifyEmailResponse;

import java.net.InetAddress;

public interface AuthService {

    RegisterResponse register(RegisterRequest request);

    UsernameAvailabilityResponse checkUsernameAvailable(String username);

    PromoCodeValidationResponse validatePromoCode(String code);

    LoginResponse login(LoginRequest request, String userAgent, InetAddress ipAddress);

    VerifyEmailResponse verifyEmail(String rawToken);
}