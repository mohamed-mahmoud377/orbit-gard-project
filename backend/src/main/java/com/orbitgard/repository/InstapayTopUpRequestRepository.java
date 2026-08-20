package com.orbitgard.repository;

import com.orbitgard.entity.InstapayTopUpRequest;
import com.orbitgard.enums.InstapayRequestStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
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

    /**
     * Locks one row for the settlement transaction.
     *
     * The job reads the file and calls the model outside any transaction —
     * a 30-second HTTP call has no business holding a database lock — so
     * the row is re-read under a lock at the moment the outcome is written.
     * That re-read is also where the status guard lives: a row that is no
     * longer PROCESSING has already been settled by somebody, and settling
     * it again is how one transfer becomes two credits.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM InstapayTopUpRequest r WHERE r.id = :id")
    Optional<InstapayTopUpRequest> findByIdForUpdate(@Param("id") UUID id);

    /**
     * Startup recovery: anything left mid-flight by a crash goes back in
     * the queue.
     *
     * A row only sits in PROCESSING while a single job run is actively
     * working on it, and every path out of that run either settles the row
     * or releases it. So a PROCESSING row at application start means the
     * previous process died holding it, and there is no in-flight work to
     * collide with — the application has only just started.
     *
     * Blanket, with no age cutoff, and that is only safe BECAUSE it runs at
     * startup. A periodic sweeper would need to tell "stranded" from
     * "claimed forty seconds ago and still being read", which this table
     * cannot answer — there is no claimed-at column. If Orbit ever runs
     * more than one instance, this needs to become a timestamped claim
     * rather than a blanket reset, because then another live instance may
     * legitimately own a PROCESSING row.
     */
    @Modifying
    @Query(value = """
            UPDATE instapay_topup_request
            SET status = 'PENDING'
            WHERE status = 'PROCESSING'
            """, nativeQuery = true)
    int releaseAllProcessing();
}