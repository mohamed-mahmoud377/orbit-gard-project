package com.orbitgard.entity;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * One row per CHILD user. Created together with the child in
 * AuthServiceImpl#addChild, in the same transaction.
 */
@Entity
@Table(name = "spending_limit")
@Getter
@Setter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class SpendingLimit {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    // The child this limit belongs to. One-to-one, enforced by the
    // unique constraint on user_id at the DB level.
    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false, unique = true)
    private User user;

    @Column(name = "max_per_transaction", nullable = false, precision = 14, scale = 2)
    private BigDecimal maxPerTransaction;

    @Column(name = "daily_limit", nullable = false, precision = 14, scale = 2)
    private BigDecimal dailyLimit;

    @Column(name = "monthly_limit", nullable = false, precision = 14, scale = 2)
    private BigDecimal monthlyLimit;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @PrePersist
    private void onCreate() {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    private void onUpdate() {
        updatedAt = OffsetDateTime.now(ZoneOffset.UTC);
    }
}