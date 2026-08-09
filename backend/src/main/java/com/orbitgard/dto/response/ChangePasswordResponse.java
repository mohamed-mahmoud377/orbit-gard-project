package com.orbitgard.dto.response;

public record ChangePasswordResponse(
        String message,
        int devicesSignedOut
) {}