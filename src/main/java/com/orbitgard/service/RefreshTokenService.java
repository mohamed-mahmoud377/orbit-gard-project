package com.orbitgard.service;

import com.orbitgard.dto.request.RefreshTokenRequest;
import com.orbitgard.dto.response.LoginResponse;

public interface RefreshTokenService {

    /**
     * Rotates a refresh token and renews its idle window. The session's
     * absolute expiry is never extended: 24 hours normally, or 30 days when
     * the user selected Remember me.
     */
    LoginResponse refresh(RefreshTokenRequest request);
}