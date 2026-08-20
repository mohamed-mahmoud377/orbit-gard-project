package com.orbitgard.service.Impl;

import com.orbitgard.dto.response.InstapayAccountResponse;
import com.orbitgard.dto.response.InstapayRequestListResponse;
import com.orbitgard.dto.response.InstapayRequestResponse;
import com.orbitgard.dto.response.InstapayUploadResponse;
import com.orbitgard.entity.InstapayTopUpRequest;
import com.orbitgard.entity.User;
import com.orbitgard.enums.AccountType;
import com.orbitgard.enums.InstapayRequestStatus;
import com.orbitgard.exceptions.ApiException;
import com.orbitgard.exceptions.ErrorCode;
import com.orbitgard.instapay.InstapayProperties;
import com.orbitgard.mapper.InstapayRequestMapper;
import com.orbitgard.repository.InstapayTopUpRequestRepository;
import com.orbitgard.repository.UserRepository;
import com.orbitgard.service.AuthenticatedUserService;
import com.orbitgard.service.InstapayStorageService;
import com.orbitgard.service.InstapayTopUpService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

@Service
@Slf4j
public class InstapayTopUpServiceImpl implements InstapayTopUpService {

    private final UserRepository userRepository;
    private final InstapayTopUpRequestRepository requestRepository;
    private final InstapayStorageService storageService;
    private final InstapayProperties properties;
    private final AuthenticatedUserService authenticatedUserService;
    private final InstapayRequestMapper requestMapper;

    public InstapayTopUpServiceImpl(UserRepository userRepository,
                                    InstapayTopUpRequestRepository requestRepository,
                                    InstapayStorageService storageService,
                                    InstapayProperties properties,
                                    AuthenticatedUserService authenticatedUserService,
                                    InstapayRequestMapper requestMapper) {
        this.userRepository = userRepository;
        this.requestRepository = requestRepository;
        this.storageService = storageService;
        this.properties = properties;
        this.authenticatedUserService = authenticatedUserService;
        this.requestMapper = requestMapper;
    }

    @Override
    @Transactional
    public InstapayUploadResponse uploadReceipt(MultipartFile file) {
        UUID userId = authenticatedUserService.currentPrincipal().userId();

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new NoSuchElementException("User not found: " + userId));

        if (user.getAccountType() == AccountType.CHILD) {
            throw new ApiException(ErrorCode.CHILD_CANNOT_TOP_UP);
        }

        if (file == null || file.isEmpty()) {
            throw new ApiException(ErrorCode.EMPTY_FILE, "file");
        }

        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            log.error("Failed to read uploaded file bytes", e);
            throw new ApiException(ErrorCode.INVALID_IMAGE, "file");
        }

        // 1. Size check: Refuse if over configured maximum (1 MB)
        if (bytes.length > properties.getMaxImageBytes()) {
            throw new ApiException(ErrorCode.FILE_TOO_LARGE, "file");
        }

        // 2. Real type check: Verify magic leading bytes for PNG/JPG
        String extension = storageService.detectImageExtension(bytes);
        if (extension == null) {
            throw new ApiException(ErrorCode.UNSUPPORTED_IMAGE_TYPE, "file");
        }

        // 3. Decodability check: Ensure valid, decodable image content
        if (!storageService.isDecodableImage(bytes)) {
            throw new ApiException(ErrorCode.INVALID_IMAGE, "file");
        }

        // 4. SHA-256 hash & duplicate check
        String sha256 = storageService.computeSha256(bytes);
        if (requestRepository.existsByFileSha256(sha256)) {
            throw new ApiException(ErrorCode.DUPLICATE_RECEIPT_IMAGE, "file");
        }

        // 5. Store file on disk
        String storagePath;
        try {
            storagePath = storageService.storeFile(bytes, extension);
        } catch (IOException e) {
            log.error("Failed to store receipt image to disk", e);
            throw new ApiException(ErrorCode.INTERNAL_ERROR);
        }

        // 6. Record row as PENDING
        InstapayTopUpRequest request = InstapayTopUpRequest.builder()
                .userId(userId)
                .storagePath(storagePath)
                .originalFilename(file.getOriginalFilename())
                .contentType(file.getContentType())
                .sizeBytes((long) bytes.length)
                .fileSha256(sha256)
                .status(InstapayRequestStatus.PENDING)
                .attemptCount(0)
                .build();

        // saveAndFlush, not save: the insert has to hit the database inside
        // this try block. Left to flush at commit, a unique-index violation
        // would surface outside every catch here and reach the client as a
        // 500 instead of "you have already uploaded this".
        try {
            request = requestRepository.saveAndFlush(request);
        } catch (DataIntegrityViolationException e) {
            // The existsByFileSha256 check above races: two identical
            // uploads can both pass it and both try to insert. The unique
            // index on file_sha256 is the guarantee, this is just how the
            // loser is told. Same code either way — the user has uploaded
            // this image before, and which of the two mechanisms noticed is
            // not their concern.
            log.info("Duplicate receipt image rejected by the unique index: userId={}", userId);
            throw new ApiException(ErrorCode.DUPLICATE_RECEIPT_IMAGE, "file");
        }

        log.info("InstaPay top-up request created in PENDING: id={}, userId={}, sha256={}",
                request.getId(), userId, sha256);

        return InstapayUploadResponse.builder()
                .id(request.getId())
                .status(request.getStatus())
                .createdAt(request.getCreatedAt())
                .message("Receipt received and queued for processing")
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public InstapayRequestListResponse listRequests() {
        UUID userId = authenticatedUserService.currentPrincipal().userId();

        List<InstapayRequestResponse> content = requestRepository
                .findByUserIdOrderByCreatedAtDesc(userId)
                .stream()
                .map(requestMapper::toResponse)
                .toList();

        // Computed from the same statuses the job writes, so the polling
        // rule and the queue cannot drift apart.
        boolean anyUnresolved = content.stream().anyMatch(response ->
                response.status() == InstapayRequestStatus.PENDING
                        || response.status() == InstapayRequestStatus.PROCESSING);

        return new InstapayRequestListResponse(content, anyUnresolved);
    }

    @Override
    @Transactional(readOnly = true)
    public InstapayRequestResponse getRequest(UUID requestId) {
        UUID userId = authenticatedUserService.currentPrincipal().userId();

        // Scoped by user in the query itself rather than fetched and then
        // checked. Somebody else's request is simply not found, which is
        // also the only thing a caller is entitled to learn about it.
        return requestRepository.findByIdAndUserId(requestId, userId)
                .map(requestMapper::toResponse)
                .orElseThrow(() -> new ApiException(ErrorCode.INSTAPAY_REQUEST_NOT_FOUND));
    }

    @Override
    public InstapayAccountResponse getAccountDetails() {
        // Straight from configuration. Nothing here is a secret — it is
        // exactly what the user is about to type into their bank app — but
        // it must come from the same place the rules read it from, or the
        // screen can tell somebody to pay a number Orbit no longer checks.
        return new InstapayAccountResponse(
                properties.getAccountName(),
                properties.getAccountNumber(),
                properties.getMinAmount(),
                properties.getMaxAmount(),
                properties.getMaxImageBytes()
        );
    }
}