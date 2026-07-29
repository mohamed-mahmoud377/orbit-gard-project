package com.orbitgard.entity;

import com.orbitgard.enums.AccountType;
import com.orbitgard.enums.UserStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Maps the users table (see the Flyway migration for the source of
 * truth on columns and constraints). Adults and children share this
 * one table, distinguished by accountType.
 *
 * created_at is assigned by the database DEFAULT. updated_at is maintained
 * by JPA before an entity update, keeping the schema portable without a
 * database-specific trigger function.
 */
@Entity
@Table(name = "users")
@Getter
@Setter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(name = "account_type", nullable = false, length = 10)
    private AccountType accountType;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 24)
    private UserStatus status;

    @Column(name = "first_name", nullable = false, length = 30)
    private String firstName;

    @Column(name = "last_name", nullable = false, length = 30)
    private String lastName;

    // Unique, lowercase, never editable after creation.
    @Column(name = "username", nullable = false, length = 30, unique = true)
    private String username;

    // Null for a CHILD.
    @Column(name = "email", length = 255, unique = true)
    private String email;

    // A requested new address awaiting confirmation (email-change flow).
    @Column(name = "pending_email", length = 255)
    private String pendingEmail;

    // Canonical +20 form only. Null for a CHILD.
    @Column(name = "phone_number", length = 13, unique = true)
    private String phoneNumber;

    @Column(name = "password_hash", nullable = false, length = 72)
    private String passwordHash;

    // Set for a CHILD, null for a USER. Self-referencing — exactly one
    // level deep, enforced at the database level, not here.
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_id")
    private User parent;

    // Captured at signup, applied later — ORB-005.
    @Column(name = "promo_code_entered", length = 32)
    private String promoCodeEntered;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false)
    private OffsetDateTime updatedAt;

    @PreUpdate
    private void updateTimestamp() {
        updatedAt = OffsetDateTime.now(java.time.ZoneOffset.UTC);
    }
}
