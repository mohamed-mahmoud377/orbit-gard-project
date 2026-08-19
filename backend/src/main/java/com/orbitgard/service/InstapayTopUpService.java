package com.orbitgard.service;

import com.orbitgard.dto.response.InstapayUploadResponse;
import org.springframework.web.multipart.MultipartFile;

public interface InstapayTopUpService {

    InstapayUploadResponse uploadReceipt(MultipartFile file);
}
