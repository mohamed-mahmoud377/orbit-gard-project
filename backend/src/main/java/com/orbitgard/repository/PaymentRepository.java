package com.orbitgard.repository;

import com.orbitgard.entity.Payment;
import com.orbitgard.enums.PaymentStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PaymentRepository extends JpaRepository<Payment, UUID> {

    Optional<Payment> findByIdAndUser_Id(UUID id, UUID userId);

    List<Payment> findByStatusInAndCreatedAtBefore(List<PaymentStatus> statuses, OffsetDateTime cutoff);

    @Modifying
    @Query("UPDATE Payment p SET p.status = :newStatus WHERE p.id = :id AND p.status IN :fromStatuses")
    int updateStatusIfCurrentlyIn(
            @Param("id") UUID id,
            @Param("fromStatuses") List<PaymentStatus> fromStatuses,
            @Param("newStatus") PaymentStatus newStatus
    );
}
