package com.orbitgard.repository;

import com.orbitgard.entity.VerificationToken;
import com.orbitgard.enums.TokenPurpose;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface VerificationTokenRepository extends JpaRepository<VerificationToken, UUID> {

    Optional<VerificationToken> findByTokenHash(String tokenHash);

    Optional<VerificationToken> findTopByUserIdAndPurposeOrderByCreatedAtDesc(UUID userId, TokenPurpose purpose);

    List<VerificationToken> findByUserIdAndPurposeAndConsumedAtIsNull(UUID userId, TokenPurpose purpose);
}