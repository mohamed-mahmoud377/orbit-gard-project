package com.orbitgard.service;

import com.orbitgard.dto.request.AddChildRequest;
import com.orbitgard.dto.request.LoginRequest;
import com.orbitgard.dto.request.RegisterRequest;
import com.orbitgard.dto.response.*;

import java.net.InetAddress;

public interface AuthService {

    RegisterResponse register(RegisterRequest request);

    UsernameAvailabilityResponse checkUsernameAvailable(String username);

    PromoCodeValidationResponse validatePromoCode(String code);

    LoginResponse login(LoginRequest request, String userAgent, InetAddress ipAddress);

    VerifyEmailResponse verifyEmail(String rawToken);

    AddChildResponse addChild(AddChildRequest request);
}