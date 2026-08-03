package com.orbitgard.repository;

import com.orbitgard.entity.Wallet;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface WalletRepository extends JpaRepository<Wallet, UUID> {

    Optional<Wallet> findByUserId(UUID userId);

    @Modifying
    @Query("UPDATE Wallet w SET w.balanceCents = w.balanceCents + :amountCents WHERE w.userId = :userId")
    int credit(@Param("userId") UUID userId, @Param("amountCents") long amountCents);
}
