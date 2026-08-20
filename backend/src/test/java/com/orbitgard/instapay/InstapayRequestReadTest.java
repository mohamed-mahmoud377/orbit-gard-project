package com.orbitgard.instapay;

import com.orbitgard.dto.response.InstapayAccountResponse;
import com.orbitgard.dto.response.InstapayRequestListResponse;
import com.orbitgard.dto.response.InstapayRequestResponse;
import com.orbitgard.entity.InstapayTopUpRequest;
import com.orbitgard.enums.AccountType;
import com.orbitgard.enums.InstapayRejectionReason;
import com.orbitgard.enums.InstapayRequestStatus;
import com.orbitgard.exceptions.ApiException;
import com.orbitgard.exceptions.ErrorCode;
import com.orbitgard.mapper.InstapayRequestMapper;
import com.orbitgard.repository.InstapayTopUpRequestRepository;
import com.orbitgard.repository.UserRepository;
import com.orbitgard.security.JwtPrincipal;
import com.orbitgard.service.AuthenticatedUserService;
import com.orbitgard.service.Impl.InstapayTopUpServiceImpl;
import com.orbitgard.service.InstapayStorageService;
import com.orbitgard.service.InstapayTopUpService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * The requests page, from the API's side.
 *
 * The interesting assertions here are all about absence: a queued row has
 * no amount and no reference, because both are read out of the picture and
 * the picture has not been looked at yet. ORB-013 shows a dash for them,
 * and a client that assumes those fields are always populated breaks on
 * every user's first upload.
 */
class InstapayRequestReadTest {

    private InstapayTopUpRequestRepository requestRepository;
    private InstapayTopUpService service;
    private InstapayProperties properties;

    private UUID userId;

    @BeforeEach
    void setUp() {
        requestRepository = mock(InstapayTopUpRequestRepository.class);
        properties = new InstapayProperties();

        AuthenticatedUserService authenticatedUserService = mock(AuthenticatedUserService.class);
        userId = UUID.randomUUID();
        when(authenticatedUserService.currentPrincipal())
                .thenReturn(new JwtPrincipal(userId, "parent_user", AccountType.USER, UUID.randomUUID()));

        service = new InstapayTopUpServiceImpl(
                mock(UserRepository.class),
                requestRepository,
                mock(InstapayStorageService.class),
                properties,
                authenticatedUserService,
                new InstapayRequestMapper());
    }

    private InstapayTopUpRequest row(InstapayRequestStatus status, OffsetDateTime createdAt) {
        InstapayTopUpRequest row = InstapayTopUpRequest.builder()
                .userId(userId)
                .storagePath("2026/08/" + UUID.randomUUID() + ".jpg")
                .fileSha256("a".repeat(64))
                .status(status)
                .attemptCount(0)
                .build();
        row.setId(UUID.randomUUID());
        row.setCreatedAt(createdAt);
        return row;
    }

    private InstapayTopUpRequest completed(long amountCents, String reference) {
        InstapayTopUpRequest row = row(InstapayRequestStatus.COMPLETED,
                OffsetDateTime.of(2026, 8, 17, 19, 47, 0, 0, ZoneOffset.UTC));
        row.setAmountCents(amountCents);
        row.setReferenceNumber(reference);
        row.setResolvedAt(OffsetDateTime.now(ZoneOffset.UTC));
        return row;
    }

    // =========================================================================

    @Test
    @DisplayName("a queued request shows no amount and no reference")
    void queuedRequestHasNeitherAmountNorReference() {
        // Both are read out of the image, so neither exists yet. The list
        // shows a dash.
        when(requestRepository.findByUserIdOrderByCreatedAtDesc(userId))
                .thenReturn(List.of(row(InstapayRequestStatus.PENDING, OffsetDateTime.now(ZoneOffset.UTC))));

        InstapayRequestResponse response = service.listRequests().content().getFirst();

        assertThat(response.status()).isEqualTo(InstapayRequestStatus.PENDING);
        assertThat(response.amount()).isNull();
        assertThat(response.referenceNumber()).isNull();
        assertThat(response.rejectionReason()).isNull();
        assertThat(response.resolvedAt()).isNull();
        assertThat(response.submittedAt()).isNotNull();
    }

    @Test
    @DisplayName("a request being read shows no amount and no reference either")
    void processingRequestIsStillEmpty() {
        when(requestRepository.findByUserIdOrderByCreatedAtDesc(userId))
                .thenReturn(List.of(row(InstapayRequestStatus.PROCESSING, OffsetDateTime.now(ZoneOffset.UTC))));

        InstapayRequestResponse response = service.listRequests().content().getFirst();

        assertThat(response.amount()).isNull();
        assertThat(response.referenceNumber()).isNull();
    }

    @Test
    @DisplayName("a completed request shows the reference and the amount that was credited")
    void completedRequestShowsBoth() {
        when(requestRepository.findByUserIdOrderByCreatedAtDesc(userId))
                .thenReturn(List.of(completed(100L, "461669173693")));

        InstapayRequestResponse response = service.listRequests().content().getFirst();

        assertThat(response.amount()).isEqualByComparingTo(new BigDecimal("1.00"));
        assertThat(response.referenceNumber()).isEqualTo("461669173693");
        assertThat(response.resolvedAt()).isNotNull();
    }

    @Test
    @DisplayName("a rejected request carries its reason code, not a sentence")
    void rejectedRequestCarriesTheCode() {
        // The frontend maps the code to wording, so a message can be
        // improved without a database migration.
        InstapayTopUpRequest rejected = row(InstapayRequestStatus.REJECTED, OffsetDateTime.now(ZoneOffset.UTC));
        rejected.setRejectionReason(InstapayRejectionReason.REFERENCE_NOT_VISIBLE);
        rejected.setResolvedAt(OffsetDateTime.now(ZoneOffset.UTC));
        when(requestRepository.findByUserIdOrderByCreatedAtDesc(userId)).thenReturn(List.of(rejected));

        InstapayRequestResponse response = service.listRequests().content().getFirst();

        assertThat(response.status()).isEqualTo(InstapayRequestStatus.REJECTED);
        assertThat(response.rejectionReason()).isEqualTo(InstapayRejectionReason.REFERENCE_NOT_VISIBLE);
    }

    @Test
    @DisplayName("a rejected request still shows whatever was readable")
    void rejectedRequestKeepsWhatWasRead() {
        InstapayTopUpRequest rejected = row(InstapayRequestStatus.REJECTED, OffsetDateTime.now(ZoneOffset.UTC));
        rejected.setRejectionReason(InstapayRejectionReason.WRONG_RECIPIENT);
        rejected.setAmountCents(100L);
        rejected.setReferenceNumber("461669173693");
        when(requestRepository.findByUserIdOrderByCreatedAtDesc(userId)).thenReturn(List.of(rejected));

        InstapayRequestResponse response = service.listRequests().content().getFirst();

        assertThat(response.amount()).isEqualByComparingTo(new BigDecimal("1.00"));
        assertThat(response.referenceNumber()).isEqualTo("461669173693");
    }

    // =========================================================================
    // The polling signal
    // =========================================================================

    @Test
    @DisplayName("anything unresolved keeps the page refreshing")
    void anyUnresolvedIsTrueWhileSomethingIsQueued() {
        when(requestRepository.findByUserIdOrderByCreatedAtDesc(userId)).thenReturn(List.of(
                row(InstapayRequestStatus.PENDING, OffsetDateTime.now(ZoneOffset.UTC)),
                completed(100L, "461669173693")));

        assertThat(service.listRequests().anyUnresolved()).isTrue();
    }

    @Test
    @DisplayName("a settled list stops refreshing")
    void anyUnresolvedIsFalseWhenEverythingIsSettled() {
        // FAILED counts as settled: nothing will look at it again on its
        // own, and the user's way forward is a new upload.
        InstapayTopUpRequest failed = row(InstapayRequestStatus.FAILED, OffsetDateTime.now(ZoneOffset.UTC));
        failed.setResolvedAt(OffsetDateTime.now(ZoneOffset.UTC));
        when(requestRepository.findByUserIdOrderByCreatedAtDesc(userId))
                .thenReturn(List.of(completed(100L, "461669173693"), failed));

        assertThat(service.listRequests().anyUnresolved()).isFalse();
    }

    @Test
    @DisplayName("a user who has never uploaded gets an empty list, not an error")
    void emptyState() {
        // Every user sees this screen before their first transfer, so it is
        // a guaranteed state rather than an edge case.
        when(requestRepository.findByUserIdOrderByCreatedAtDesc(userId)).thenReturn(List.of());

        InstapayRequestListResponse response = service.listRequests();

        assertThat(response.content()).isEmpty();
        assertThat(response.anyUnresolved()).isFalse();
    }

    @Test
    @DisplayName("the order the repository returns is the order the client gets")
    void orderIsPreserved() {
        InstapayTopUpRequest newest = completed(100L, "aaa");
        InstapayTopUpRequest oldest = completed(200L, "bbb");
        when(requestRepository.findByUserIdOrderByCreatedAtDesc(userId)).thenReturn(List.of(newest, oldest));

        assertThat(service.listRequests().content())
                .extracting(InstapayRequestResponse::id)
                .containsExactly(newest.getId(), oldest.getId());
    }

    // =========================================================================
    // One request
    // =========================================================================

    @Test
    @DisplayName("a request is fetched scoped to its owner")
    void singleRequestIsScopedToTheUser() {
        InstapayTopUpRequest row = completed(100L, "461669173693");
        when(requestRepository.findByIdAndUserId(row.getId(), userId)).thenReturn(Optional.of(row));

        assertThat(service.getRequest(row.getId()).referenceNumber()).isEqualTo("461669173693");
    }

    @Test
    @DisplayName("somebody else's request is not found, never forbidden")
    void anotherUsersRequestIsNotFound() {
        // 404 rather than 403: "this id does not exist for you" is all a
        // caller is entitled to learn about a request that is not theirs.
        UUID otherId = UUID.randomUUID();
        when(requestRepository.findByIdAndUserId(otherId, userId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getRequest(otherId))
                .isInstanceOf(ApiException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.INSTAPAY_REQUEST_NOT_FOUND);
    }

    // =========================================================================
    // Account details
    // =========================================================================

    @Test
    @DisplayName("the account screen is served from the same configuration the rules read")
    void accountDetailsComeFromConfiguration() {
        // If these ever disagree, the screen tells somebody to pay a number
        // that WRONG_RECIPIENT will then reject.
        InstapayAccountResponse account = service.getAccountDetails();

        assertThat(account.accountNumber()).isEqualTo(properties.getAccountNumber());
        assertThat(account.accountName()).isEqualTo(properties.getAccountName());
        assertThat(account.minAmount()).isEqualByComparingTo(new BigDecimal("0.01"));
        assertThat(account.maxAmount()).isEqualByComparingTo(new BigDecimal("70000.00"));
        assertThat(account.maxImageBytes()).isEqualTo(1_048_576L);
    }
}
