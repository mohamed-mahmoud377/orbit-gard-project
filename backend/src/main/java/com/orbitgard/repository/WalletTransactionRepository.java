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
import java.util.Collection;
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

    @Query("SELECT COALESCE(SUM(t.amountCents), 0) FROM WalletTransaction t " +
            "WHERE t.walletId = :walletId AND t.direction = com.orbitgard.enums.TransactionDirection.DEBIT " +
            "AND t.status = com.orbitgard.enums.TransactionStatus.COMPLETED " +
            "AND t.createdAt >= :from AND t.createdAt < :to")
    long sumCompletedDebitsBetween(@Param("walletId") UUID walletId,
                                   @Param("from") OffsetDateTime from,
                                   @Param("to") OffsetDateTime to);


    /**
     * Count of transactions on one wallet in a given status, inside a window.
     *
     * Explicit @Query rather than a derived query: a derived name binds only
     * the properties it spells out, so the start/end arguments had nowhere to
     * go and Spring Data rejected the method while building the repository
     * proxy ("Invalid number of parameters given") — taking the whole
     * application context down at startup, not just this one call.
     *
     * Named ...AndPeriod to match sumAmountCentsByWalletAndDirectionAndStatusAndPeriod
     * above: both are period-scoped and both back getMonthlySummaryForUser.
     *
     * Window is half-open [start, end), matching every other period query here.
     */
    @Query("""
            SELECT COUNT(t)
            FROM WalletTransaction t
            WHERE t.walletId = :walletId
              AND t.status = :status
              AND t.createdAt >= :from
              AND t.createdAt < :to
            """)
    long countByWalletAndStatusAndPeriod(@Param("walletId") UUID walletId,
                                         @Param("status") TransactionStatus status,
                                         @Param("from") OffsetDateTime from,
                                         @Param("to") OffsetDateTime to);

    // ---------------------------------------------------------------------
    // Family tab aggregates (ORB Family overview).
    //
    // Set-wide variants of the single-wallet sums above, so the parent's
    // stats bar is three queries regardless of how many children there are.
    // Callers must not pass an empty collection — an empty IN () list is not
    // portable SQL; FamilyServiceImpl short-circuits before reaching here.
    // ---------------------------------------------------------------------

    /** Sum of COMPLETED debits across a set of wallets in a window — "spent this month". */
    @Query("""
            SELECT COALESCE(SUM(t.amountCents), 0)
            FROM WalletTransaction t
            WHERE t.walletId IN :walletIds
              AND t.direction = com.orbitgard.enums.TransactionDirection.DEBIT
              AND t.status = com.orbitgard.enums.TransactionStatus.COMPLETED
              AND t.createdAt >= :from
              AND t.createdAt < :to
            """)
    long sumCompletedDebitsForWalletsBetween(@Param("walletIds") Collection<UUID> walletIds,
                                             @Param("from") OffsetDateTime from,
                                             @Param("to") OffsetDateTime to);

    /**
     * Sum of COMPLETED internal-transfer credits landing in the given child
     * wallets whose counterparty is the parent's wallet — "allocated this
     * month". Reads the credit leg rather than the parent's debit leg so a
     * transfer the parent sent to a non-child never counts.
     */
    @Query("""
            SELECT COALESCE(SUM(t.amountCents), 0)
            FROM WalletTransaction t
            WHERE t.walletId IN :childWalletIds
              AND t.counterpartyWalletId = :parentWalletId
              AND t.type = com.orbitgard.enums.TransactionType.INTERNAL_TRANSFER
              AND t.direction = com.orbitgard.enums.TransactionDirection.CREDIT
              AND t.status = com.orbitgard.enums.TransactionStatus.COMPLETED
              AND t.createdAt >= :from
              AND t.createdAt < :to
            """)
    long sumCompletedAllocationsFromParentBetween(@Param("childWalletIds") Collection<UUID> childWalletIds,
                                                  @Param("parentWalletId") UUID parentWalletId,
                                                  @Param("from") OffsetDateTime from,
                                                  @Param("to") OffsetDateTime to);

    /** Count of REJECTED transactions across a set of wallets in a window — "blocked attempts". */
    @Query("""
            SELECT COUNT(t)
            FROM WalletTransaction t
            WHERE t.walletId IN :walletIds
              AND t.status = com.orbitgard.enums.TransactionStatus.REJECTED
              AND t.createdAt >= :from
              AND t.createdAt < :to
            """)
    long countRejectedForWalletsBetween(@Param("walletIds") Collection<UUID> walletIds,
                                        @Param("from") OffsetDateTime from,
                                        @Param("to") OffsetDateTime to);
}