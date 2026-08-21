package com.orbitgard.entity;

import com.orbitgard.enums.PaymentStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "payment")
@Getter
@Setter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class Payment {

    @Id
    @Column(name = "id")
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    /**
     * What the card is charged — the wallet credit plus the service fee.
     *
     * This is the number sent to Paymob, and the one
     * PaymentConfirmationServiceImpl compares against the amount the webhook
     * reports back. Changing what it means would silently disarm that check.
     */
    @Column(name = "amount_cents", nullable = false)
    private int amountCents;

    /**
     * What lands in the wallet — the amount the user asked for, before the
     * fee was added on top. This is what gets credited on success, and the
     * reason the two are separate columns.
     */
    @Column(name = "credit_cents", nullable = false)
    private int creditCents;

    @Column(name = "currency", nullable = false, length = 3)
    private String currency;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 24)
    private PaymentStatus status;

    @Column(name = "paymob_intention_id", length = 64)
    private String paymobIntentionId;

    @Column(name = "failure_reason", length = 255)
    private String failureReason;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime updatedAt;
    @Column(name = "paymob_client_secret")
    private String paymobClientSecret;
}
