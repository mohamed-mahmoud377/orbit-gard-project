package com.orbitgard.auth.controller;

import com.orbitgard.auth.dto.request.LoginRequest;
import com.orbitgard.auth.dto.request.RefreshTokenRequest;
import com.orbitgard.auth.dto.response.LoginResponse;
import com.orbitgard.auth.service.LoginService;
import com.orbitgard.auth.service.RefreshTokenService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final LoginService loginService;
    private final RefreshTokenService refreshTokenService;

    public AuthController(LoginService loginService, RefreshTokenService refreshTokenService) {
        this.loginService = loginService;
        this.refreshTokenService = refreshTokenService;
    }

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(
            @Valid @RequestBody LoginRequest request,
            @RequestHeader(value = HttpHeaders.USER_AGENT, required = false) String userAgent,
            HttpServletRequest httpRequest) {
        return ResponseEntity.ok(loginService.login(request, userAgent, resolveRemoteAddress(httpRequest)));
    }

    @PostMapping("/refresh")
    public ResponseEntity<LoginResponse> refresh(@Valid @RequestBody RefreshTokenRequest request) {
        return ResponseEntity.ok(refreshTokenService.refresh(request));
    }
    @GetMapping("/hi")
    public Map<String, String> ping() {
        return Map.of("status", "ok", "service", "orbit graduation project is working fine on the remote server toz fe syam");
    }
    private InetAddress resolveRemoteAddress(HttpServletRequest request) {
        try {
            return InetAddress.getByName(request.getRemoteAddr());
        } catch (UnknownHostException ex) {
            throw new IllegalStateException("Unable to resolve request IP address", ex);
        }
    }
}
