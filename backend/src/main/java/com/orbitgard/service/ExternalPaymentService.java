package com.orbitgard.service;

import com.orbitgard.dto.request.ExternalPayRequest;
import com.orbitgard.dto.request.ExternalVerifyRequest;
import com.orbitgard.dto.response.ExternalPayResponse;
import com.orbitgard.dto.response.ExternalVerifyResponse;

import java.math.BigDecimal;

public interface ExternalPaymentService {

    ExternalVerifyResponse verify(ExternalVerifyRequest request);

    ExternalPayResponse pay(ExternalPayRequest request);
}
