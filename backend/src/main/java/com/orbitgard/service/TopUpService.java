package com.orbitgard.service;

import com.orbitgard.dto.request.TopUpRequest;
import com.orbitgard.dto.response.TopUpResponse;

import java.util.UUID;

public interface TopUpService {

    TopUpResponse initiate(UUID userId, TopUpRequest request);
}