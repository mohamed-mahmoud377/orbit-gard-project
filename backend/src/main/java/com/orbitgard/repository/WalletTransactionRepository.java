package com.orbitgard.repository;

import com.orbitgard.entity.WalletTransaction;
import com.orbitgard.enums.TransactionStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface WalletTransactionRepository extends JpaRepository<WalletTransaction, UUID> {

    List<WalletTransaction> findByWalletIdOrderByCreatedAtAsc(UUID walletId);

    List<WalletTransaction> findByStatus(TransactionStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT t FROM WalletTransaction t WHERE t.id = :id")
    java.util.Optional<WalletTransaction> findByIdForUpdate(@Param("id") UUID id);

    boolean existsByReference(String reference);
}
