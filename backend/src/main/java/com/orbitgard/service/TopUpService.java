package com.orbitgard.service;

import com.orbitgard.dto.request.TopUpRequest;
import com.orbitgard.dto.response.TopUpResponse;

public interface TopUpService {

    TopUpResponse initiate(TopUpRequest request);
}
