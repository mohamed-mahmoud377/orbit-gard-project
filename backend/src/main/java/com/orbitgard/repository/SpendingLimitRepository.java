package com.orbitgard.repository;

import com.orbitgard.entity.SpendingLimit;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface SpendingLimitRepository extends JpaRepository<SpendingLimit, UUID> {
    Optional<SpendingLimit> findByUser_Id(UUID userId);
}