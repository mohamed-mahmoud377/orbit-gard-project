package com.orbitgard.repository;

import com.orbitgard.entity.InstapayTopUpRequest;
import com.orbitgard.enums.InstapayRequestStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface InstapayTopUpRequestRepository extends JpaRepository<InstapayTopUpRequest, UUID> {

    boolean existsByFileSha256(String fileSha256);

    Optional<InstapayTopUpRequest> findByFileSha256(String fileSha256);

    Optional<InstapayTopUpRequest> findByIdAndUserId(UUID id, UUID userId);

    List<InstapayTopUpRequest> findByUserIdOrderByCreatedAtDesc(UUID userId);

    Page<InstapayTopUpRequest> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable pageable);

    boolean existsByReferenceNumberAndStatus(String referenceNumber, InstapayRequestStatus status);

    @Query(value = """
            SELECT * FROM instapay_topup_request
            WHERE status = 'PENDING'
            ORDER BY created_at ASC
            LIMIT :limit
            FOR UPDATE SKIP LOCKED
            """, nativeQuery = true)
    List<InstapayTopUpRequest> findPendingForProcessing(@Param("limit") int limit);
}
