package com.orbitgard.repository;

import com.orbitgard.entity.VerificationToken;
import com.orbitgard.enums.TokenPurpose;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface VerificationTokenRepository extends JpaRepository<VerificationToken, UUID> {

    Optional<VerificationToken> findByTokenHash(String tokenHash);

    Optional<VerificationToken> findTopByUserIdAndPurposeOrderByCreatedAtDesc(UUID userId, TokenPurpose purpose);

    List<VerificationToken> findByUserIdAndPurposeAndConsumedAtIsNull(UUID userId, TokenPurpose purpose);


    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
       SELECT t
       FROM VerificationToken t
       WHERE t.tokenHash = :tokenHash
       """)
    Optional<VerificationToken> findByTokenHashForUpdate(@Param("tokenHash") String tokenHash);
}