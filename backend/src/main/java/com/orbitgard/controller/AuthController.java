package com.orbitgard.controller;

import com.orbitgard.dto.request.LoginRequest;
import com.orbitgard.dto.request.RefreshTokenRequest;
import com.orbitgard.dto.request.RegisterRequest;
import com.orbitgard.dto.response.LoginResponse;
import com.orbitgard.dto.response.RegisterResponse;
import com.orbitgard.dto.response.UsernameAvailabilityResponse;
import com.orbitgard.service.AuthService;
import com.orbitgard.service.RefreshTokenService;
import com.orbitgard.validation.annotation.ValidUsername;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.InetAddress;
import java.net.UnknownHostException;

@RestController
@RequestMapping("/auth")
public class AuthController {

    private final AuthService authService;
    private final RefreshTokenService refreshTokenService;

    public AuthController(AuthService authService, RefreshTokenService refreshTokenService) {
        this.authService = authService;
        this.refreshTokenService = refreshTokenService;
    }

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(
            @Valid @RequestBody LoginRequest request,
            @RequestHeader(value = HttpHeaders.USER_AGENT, required = false) String userAgent,
            HttpServletRequest httpRequest) {
        return ResponseEntity.ok(authService.login(request, userAgent, resolveRemoteAddress(httpRequest)));
    }

    @PostMapping("/refresh")
    public ResponseEntity<LoginResponse> refresh(@Valid @RequestBody RefreshTokenRequest request) {
        return ResponseEntity.ok(refreshTokenService.refresh(request));
    }

    @PostMapping("/register")
    public ResponseEntity<RegisterResponse> register(
            @Valid @RequestBody RegisterRequest request) {

        RegisterResponse response = authService.register(request);

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(response);
    }

    @GetMapping("/username-available")
    public UsernameAvailabilityResponse checkUsernameAvailable(
            @ValidUsername @RequestParam String username) {
        return authService.checkUsernameAvailable(username);
    }

    private InetAddress resolveRemoteAddress(HttpServletRequest request) {
        try {
            return InetAddress.getByName(request.getRemoteAddr());
        } catch (UnknownHostException ex) {
            throw new IllegalStateException("Unable to resolve request IP address", ex);
        }
    }
}