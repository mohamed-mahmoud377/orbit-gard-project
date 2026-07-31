package com.orbitgard.dto.response;

import com.orbitgard.enums.UserStatus;
import lombok.AllArgsConstructor;
import lombok.Getter;

import java.time.OffsetDateTime;

@Getter
@AllArgsConstructor
public class VerifyEmailResponse {

    private String username;
    private UserStatus status;
    private OffsetDateTime activatedAt;
}