package com.orbitgard.service;

import com.orbitgard.dto.request.InternalTransferRequest;
import com.orbitgard.dto.response.InternalTransferResponse;

public interface InternalTransferService {
    InternalTransferResponse transfer(InternalTransferRequest request);
}