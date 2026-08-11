package com.orbitgard.entity;

import com.orbitgard.enums.TransactionDirection;
import com.orbitgard.enums.TransactionStatus;
import com.orbitgard.enums.TransactionType;
import com.orbitgard.validation.annotation.ValidWalletTransactionConstraints;
import com.orbitgard.validation.annotation.ValidWalletTransactionImmutability;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PostLoad;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "wallet_transaction")
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@ValidWalletTransactionConstraints
@ValidWalletTransactionImmutability
public class WalletTransaction {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id")
    private UUID id;

    @Column(name = "wallet_id", nullable = false)
    private UUID walletId;

    @jakarta.validation.constraints.NotNull
    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false, length = 24)
    private TransactionType type;

    @jakarta.validation.constraints.NotNull
    @Enumerated(EnumType.STRING)
    @Column(name = "direction", nullable = false, length = 10)
    private TransactionDirection direction;

    @jakarta.validation.constraints.NotNull
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private TransactionStatus status;

    @Positive
    @Column(name = "amount_cents", nullable = false)
    private long amountCents;

    @Min(0)
    @Column(name = "balance_before_cents", nullable = false)
    private long balanceBeforeCents;

    @Min(0)
    @Column(name = "balance_after_cents", nullable = false)
    private long balanceAfterCents;

    @NotBlank
    @Size(max = 32)
    @Column(name = "reference", nullable = false, unique = true, length = 32)
    private String reference;

    @NotBlank
    @Size(max = 32)
    @Column(name = "transaction_public_id", nullable = false, unique = true, length = 32)
    private String transactionPublicId;

    @Size(max = 500)
    @Column(name = "description", length = 500)
    private String description;

    @Column(name = "counterparty", length = 255)
    private String counterparty;

    @Column(name = "counterparty_wallet_id")
    private UUID counterpartyWalletId;

    @Column(name = "related_transaction_id")
    private UUID relatedTransactionId;

    @Column(name = "payment_id")
    private UUID paymentId;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "resolved_at")
    private OffsetDateTime resolvedAt;

    // Transient fields to track original values for immutability validation
    @Transient
    private TransactionStatus originalStatus;

    @Transient
    private OffsetDateTime originalResolvedAt;

    @PostLoad
    public void captureOriginalState() {
        this.originalStatus = this.status;
        this.originalResolvedAt = this.resolvedAt;
    }

    @PreUpdate
    public void validateImmutability() {
        // Wallet transaction fields are immutable except status and resolved_at
        if (!this.walletId.equals(this.walletId)
                || !this.type.equals(this.type)
                || !this.direction.equals(this.direction)
                || this.amountCents != this.amountCents
                || this.balanceBeforeCents != this.balanceBeforeCents
                || this.balanceAfterCents != this.balanceAfterCents
                || !this.reference.equals(this.reference)
                || !this.transactionPublicId.equals(this.transactionPublicId)) {
            throw new IllegalStateException("wallet transaction fields are immutable");
        }

        // Only certain transitions are allowed for status
        if (!this.originalStatus.equals(TransactionStatus.PENDING)) {
            throw new IllegalStateException("a wallet transaction may only move from PENDING to COMPLETED or REJECTED");
        }

        if (!this.status.equals(TransactionStatus.COMPLETED) && !this.status.equals(TransactionStatus.REJECTED)) {
            throw new IllegalStateException("a wallet transaction may only move from PENDING to COMPLETED or REJECTED");
        }

        if (this.originalResolvedAt != null || this.resolvedAt == null) {
            throw new IllegalStateException("a wallet transaction may only move from PENDING to COMPLETED or REJECTED");
        }
    }

    public void resolve(TransactionStatus newStatus, OffsetDateTime resolvedAt) {
        if (this.status != TransactionStatus.PENDING) {
            throw new IllegalStateException("Only a PENDING transaction can be resolved");
        }
        if (newStatus != TransactionStatus.COMPLETED && newStatus != TransactionStatus.REJECTED) {
            throw new IllegalStateException("A transaction may only resolve to COMPLETED or REJECTED");
        }
        if (resolvedAt == null) {
            throw new IllegalStateException("resolved_at must not be null when resolving a transaction");
        }
        this.status = newStatus;
        this.resolvedAt = resolvedAt;
    }
}
