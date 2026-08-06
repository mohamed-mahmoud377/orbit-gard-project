package com.orbitgard.repository;

import com.orbitgard.entity.Session;
import com.orbitgard.enums.SessionRevokedReason;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SessionRepository extends JpaRepository<Session, UUID> {

    Optional<Session> findByRefreshTokenHash(String refreshTokenHash);

    @Query("SELECT s FROM Session s WHERE s.user.id = :userId "
            + "AND s.revokedAt IS NULL "
            + "AND s.idleExpiresAt > :now "
            + "AND s.absoluteExpiresAt > :now "
            + "ORDER BY s.lastUsedAt DESC")
    List<Session> findActiveByUserId(@Param("userId") UUID userId, @Param("now") OffsetDateTime now);

    @Modifying
    @Query("UPDATE Session s SET s.revokedAt = :now, s.revokedReason = :reason "
            + "WHERE s.id = :id AND s.user.id = :userId AND s.revokedAt IS NULL")
    int revokeIfActive(
            @Param("id") UUID id,
            @Param("userId") UUID userId,
            @Param("reason") SessionRevokedReason reason,
            @Param("now") OffsetDateTime now
    );

    @Modifying
    @Query("UPDATE Session s SET s.revokedAt = :now, s.revokedReason = :reason "
            + "WHERE s.user.id = :userId AND s.id <> :currentSessionId AND s.revokedAt IS NULL")
    int revokeAllExcept(
            @Param("userId") UUID userId,
            @Param("currentSessionId") UUID currentSessionId,
            @Param("reason") SessionRevokedReason reason,
            @Param("now") OffsetDateTime now
    );
    int countByUserIdAndRevokedAtIsNull(UUID userId);

    @Modifying
    @Query("""
    UPDATE Session s
    SET s.revokedAt = CURRENT_TIMESTAMP, s.revokedReason = :reason
    WHERE s.user.id = :userId AND s.revokedAt IS NULL
    """)
    void revokeAllActiveByUserId(@Param("userId") UUID userId, @Param("reason") SessionRevokedReason reason);
}