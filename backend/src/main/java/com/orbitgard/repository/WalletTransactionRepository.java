package com.orbitgard.repository;

import com.orbitgard.entity.WalletTransaction;
import com.orbitgard.enums.TransactionDirection;
import com.orbitgard.enums.TransactionStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface WalletTransactionRepository extends JpaRepository<WalletTransaction, UUID> {

    Page<WalletTransaction> findByWalletIdOrderByCreatedAtAsc(UUID walletId, Pageable pageable);

    List<WalletTransaction> findByStatus(TransactionStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT t FROM WalletTransaction t WHERE t.id = :id")
    java.util.Optional<WalletTransaction> findByIdForUpdate(@Param("id") UUID id);

    boolean existsByReference(String reference);

    @Query("""
        SELECT COALESCE(SUM(t.amountCents), 0)
        FROM WalletTransaction t
        WHERE t.walletId = :walletId
          AND t.direction = :direction
          AND t.status = :status
          AND t.createdAt >= :from
          AND t.createdAt < :to
        """)
    long sumAmountCentsByWalletAndDirectionAndStatusAndPeriod(@Param("walletId") UUID walletId,
                                                              @Param("direction") TransactionDirection direction,
                                                              @Param("status") TransactionStatus status,
                                                              @Param("from") OffsetDateTime from,
                                                              @Param("to") OffsetDateTime to);


    long countByWalletIdAndStatus(UUID walletId, TransactionStatus status, OffsetDateTime start, OffsetDateTime end);
}
