package com.orbitgard.instapay;

import com.orbitgard.entity.InstapayTopUpRequest;
import com.orbitgard.entity.Wallet;
import com.orbitgard.entity.WalletTransaction;
import com.orbitgard.enums.InstapayRejectionReason;
import com.orbitgard.enums.InstapayRequestStatus;
import com.orbitgard.enums.ReceiptReadFailure;
import com.orbitgard.mapper.InstapayReceiptMapper;
import com.orbitgard.receipt.ReceiptExtraction;
import com.orbitgard.receipt.ReceiptReadResult;
import com.orbitgard.repository.InstapayTopUpRequestRepository;
import com.orbitgard.service.Impl.InstapayTransitionServiceImpl;
import com.orbitgard.service.InstapayTransitionService;
import com.orbitgard.service.WalletService;
import com.orbitgard.service.WalletTransactionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * The transaction boundaries, and in particular the one that guards money.
 *
 * The rules and the mapper are real here rather than mocked — they are
 * pure and fast, and a test that stubs the decision would prove only that
 * this class can copy a value.
 */
class InstapayTransitionServiceTest {

    private static final int MAX_ATTEMPTS = 3;

    private InstapayTopUpRequestRepository requestRepository;
    private WalletService walletService;
    private WalletTransactionService walletTransactionService;
    private InstapayTransitionService transitions;

    private UUID requestId;
    private UUID userId;
    private UUID walletId;
    private UUID transactionId;

    @BeforeEach
    void setUp() {
        requestRepository = mock(InstapayTopUpRequestRepository.class);
        walletService = mock(WalletService.class);
        walletTransactionService = mock(WalletTransactionService.class);

        InstapayProperties props = new InstapayProperties();
        // The implementation, deliberately, not a proxy: these tests are
        // about what each method does, not about where the transaction
        // boundary sits. The boundary is a Spring concern and the only
        // thing that proves it is a running context.
        transitions = new InstapayTransitionServiceImpl(
                requestRepository,
                new InstapayReceiptMapper(),
                new ReceiptRules(props, new RecipientMatcher(props)),
                walletService,
                walletTransactionService);

        requestId = UUID.randomUUID();
        userId = UUID.randomUUID();
        walletId = UUID.randomUUID();
        transactionId = UUID.randomUUID();

        Wallet wallet = mock(Wallet.class);
        when(wallet.getId()).thenReturn(walletId);
        when(walletService.requireByUserId(userId)).thenReturn(wallet);

        WalletTransaction transaction = mock(WalletTransaction.class);
        when(transaction.getId()).thenReturn(transactionId);
        when(walletTransactionService.recordInstapayTopUpCredit(any(), anyLong(), anyString()))
                .thenReturn(transaction);
    }

    private InstapayTopUpRequest row(InstapayRequestStatus status) {
        InstapayTopUpRequest row = InstapayTopUpRequest.builder()
                .userId(userId)
                .storagePath("2026/08/" + UUID.randomUUID() + ".jpg")
                .fileSha256("a".repeat(64))
                .status(status)
                .attemptCount(0)
                .build();
        row.setId(requestId);

        when(requestRepository.findByIdForUpdate(requestId)).thenReturn(Optional.of(row));
        return row;
    }

    private static ReceiptExtraction validExtraction() {
        return ReceiptExtraction.builder()
                .isTransferReceipt(true)
                .isSuccessful(true)
                .amount("1.00")
                .amountAsShown("1 EGP")
                .currency("EGP")
                .referenceNumber("461669173693")
                .recipientNameMasked("MOHAMED M****** S*** I*****")
                .recipientPhone("01111545710")
                .senderHandle("jerryscb@instapay")
                .senderBank("Suez Canal Bank")
                .transferDateTime("2026-08-17T19:47:00")
                .note("Living Expenses")
                .build();
    }

    private static ReceiptReadResult successfulRead(ReceiptExtraction extraction) {
        return ReceiptReadResult.builder()
                .extraction(extraction)
                .model("gemini-3.1-flash-lite")
                .inputTokens(1487)
                .outputTokens(142)
                .callDuration(Duration.ofMillis(900))
                .build();
    }

    private static ReceiptReadResult failedRead(ReceiptReadFailure failure, int in, int out) {
        return ReceiptReadResult.builder()
                .failure(failure)
                .model("gemini-3.1-flash-lite")
                .inputTokens(in)
                .outputTokens(out)
                .callDuration(Duration.ofMillis(400))
                .build();
    }

    // =========================================================================
    // Crediting
    // =========================================================================

    @Test
    @DisplayName("a receipt that passes the rules credits the wallet exactly once")
    void creditsOnce() {
        InstapayTopUpRequest row = row(InstapayRequestStatus.PROCESSING);

        transitions.settle(requestId, successfulRead(validExtraction()));

        verify(walletTransactionService).recordInstapayTopUpCredit(walletId, 100L, "461669173693");
        assertThat(row.getStatus()).isEqualTo(InstapayRequestStatus.COMPLETED);
        assertThat(row.getTransactionId()).isEqualTo(transactionId);
        assertThat(row.getResolvedAt()).isNotNull();
        assertThat(row.getRejectionReason()).isNull();
    }

    @Test
    @DisplayName("the fee is never credited — only what arrived")
    void creditsTheTransferAmountNotTheTotal() {
        row(InstapayRequestStatus.PROCESSING);

        transitions.settle(requestId, successfulRead(validExtraction().toBuilder()
                .fees("0.50")
                .totalAmount("1.50")
                .build()));

        // 1.50 is what the sender paid their bank. Only 1.00 arrived.
        verify(walletTransactionService).recordInstapayTopUpCredit(eq(walletId), eq(100L), anyString());
    }

    @Test
    @DisplayName("everything read out of the image lands on the row")
    void extractedFieldsArePersisted() {
        InstapayTopUpRequest row = row(InstapayRequestStatus.PROCESSING);

        transitions.settle(requestId, successfulRead(validExtraction()));

        assertThat(row.getAmountCents()).isEqualTo(100L);
        assertThat(row.getAmountAsShown()).isEqualTo("1 EGP");
        assertThat(row.getCurrency()).isEqualTo("EGP");
        assertThat(row.getReferenceNumber()).isEqualTo("461669173693");
        assertThat(row.getRecipientPhone()).isEqualTo("01111545710");
        assertThat(row.getRecipientNameMasked()).isEqualTo("MOHAMED M****** S*** I*****");
        assertThat(row.getTransferDateTime()).isNotNull();
    }

    // =========================================================================
    // The double-credit guard
    // =========================================================================

    @Test
    @DisplayName("a row that is no longer PROCESSING is never settled a second time")
    void alreadySettledRowIsNotCreditedAgain() {
        // This is the shape of the bug that costs real money. The credit and
        // the status flip share one transaction, so a crash between them
        // rolls both back — but if a row ever does get looked at twice, the
        // status guard is what stops the second credit.
        InstapayTopUpRequest row = row(InstapayRequestStatus.COMPLETED);
        row.setTransactionId(transactionId);

        assertThat(transitions.settle(requestId, successfulRead(validExtraction()))).isNull();

        verifyNoInteractions(walletTransactionService);
        verifyNoInteractions(walletService);
        assertThat(row.getStatus()).isEqualTo(InstapayRequestStatus.COMPLETED);
    }

    @Test
    @DisplayName("a reference already credited elsewhere is rejected, not credited")
    void duplicateReferenceIsRejected() {
        InstapayTopUpRequest row = row(InstapayRequestStatus.PROCESSING);
        when(requestRepository.existsByReferenceNumberAndStatus(
                "461669173693", InstapayRequestStatus.COMPLETED)).thenReturn(true);

        transitions.settle(requestId, successfulRead(validExtraction()));

        verifyNoInteractions(walletTransactionService);
        assertThat(row.getStatus()).isEqualTo(InstapayRequestStatus.REJECTED);
        assertThat(row.getRejectionReason()).isEqualTo(InstapayRejectionReason.DUPLICATE_REFERENCE);
    }

    @Test
    @DisplayName("markDuplicateReference writes the outcome after the index refused the credit")
    void markDuplicateAfterConstraintViolation() {
        InstapayTopUpRequest row = row(InstapayRequestStatus.PROCESSING);

        transitions.markDuplicateReference(requestId);

        assertThat(row.getStatus()).isEqualTo(InstapayRequestStatus.REJECTED);
        assertThat(row.getRejectionReason()).isEqualTo(InstapayRejectionReason.DUPLICATE_REFERENCE);
        assertThat(row.getResolvedAt()).isNotNull();
    }

    // =========================================================================
    // Rejection
    // =========================================================================

    @Test
    @DisplayName("a rejected receipt records the code and credits nothing")
    void rejectionStoresTheCode() {
        InstapayTopUpRequest row = row(InstapayRequestStatus.PROCESSING);

        transitions.settle(requestId, successfulRead(validExtraction().toBuilder()
                .referenceNumber(null)
                .build()));

        verifyNoInteractions(walletTransactionService);
        assertThat(row.getStatus()).isEqualTo(InstapayRequestStatus.REJECTED);
        assertThat(row.getRejectionReason()).isEqualTo(InstapayRejectionReason.REFERENCE_NOT_VISIBLE);
        assertThat(row.getTransactionId()).isNull();
        assertThat(row.getResolvedAt()).isNotNull();
    }

    @Test
    @DisplayName("a rejection still records what the call cost")
    void rejectionRecordsTokens() {
        // A rejected request cost a call just like a credited one. Only a
        // row that never reached the model has nothing to record.
        InstapayTopUpRequest row = row(InstapayRequestStatus.PROCESSING);

        transitions.settle(requestId, successfulRead(validExtraction().toBuilder()
                .referenceNumber(null)
                .build()));

        assertThat(row.getInputTokens()).isEqualTo(1487);
        assertThat(row.getOutputTokens()).isEqualTo(142);
        assertThat(row.getModel()).isEqualTo("gemini-3.1-flash-lite");
        assertThat(row.getCallDurationMs()).isEqualTo(900L);
    }

    // =========================================================================
    // Failure and retry
    // =========================================================================

    @Test
    @DisplayName("a failed read goes back in the queue with one attempt spent")
    void failedReadIsRequeued() {
        InstapayTopUpRequest row = row(InstapayRequestStatus.PROCESSING);

        transitions.recordReadFailure(requestId, failedRead(ReceiptReadFailure.TRANSPORT_ERROR, 1487, 0), MAX_ATTEMPTS);

        assertThat(row.getStatus()).isEqualTo(InstapayRequestStatus.PENDING);
        assertThat(row.getAttemptCount()).isEqualTo(1);
        assertThat(row.getResolvedAt()).isNull();
    }

    @Test
    @DisplayName("at the attempt cap the row becomes FAILED")
    void failsAtTheCap() {
        InstapayTopUpRequest row = row(InstapayRequestStatus.PROCESSING);
        row.setAttemptCount(MAX_ATTEMPTS - 1);

        transitions.recordReadFailure(requestId, failedRead(ReceiptReadFailure.TRANSPORT_ERROR, 1487, 0), MAX_ATTEMPTS);

        assertThat(row.getStatus()).isEqualTo(InstapayRequestStatus.FAILED);
        assertThat(row.getAttemptCount()).isEqualTo(MAX_ATTEMPTS);
        assertThat(row.getResolvedAt()).isNotNull();
    }

    @Test
    @DisplayName("token counts accumulate across retries rather than overwriting")
    void tokensAccumulate() {
        // Overwrite instead of accumulate and the most expensive rows in the
        // table — the ones retried three times — look like the cheapest.
        InstapayTopUpRequest row = row(InstapayRequestStatus.PROCESSING);

        transitions.recordReadFailure(requestId, failedRead(ReceiptReadFailure.MALFORMED_EXTRACTION, 1487, 142), MAX_ATTEMPTS);
        row.setStatus(InstapayRequestStatus.PROCESSING);
        transitions.recordReadFailure(requestId, failedRead(ReceiptReadFailure.MALFORMED_EXTRACTION, 1490, 138), MAX_ATTEMPTS);

        assertThat(row.getInputTokens()).isEqualTo(2977);
        assertThat(row.getOutputTokens()).isEqualTo(280);
    }

    @Test
    @DisplayName("a file that never reached the model records no tokens")
    void unreadableFileCostsNothing() {
        InstapayTopUpRequest row = row(InstapayRequestStatus.PROCESSING);

        transitions.recordReadFailure(requestId, null, MAX_ATTEMPTS);

        assertThat(row.getAttemptCount()).isEqualTo(1);
        assertThat(row.getInputTokens()).isZero();
        assertThat(row.getOutputTokens()).isZero();
    }

    @Test
    @DisplayName("releasing a row for a backoff does not spend one of its attempts")
    void releaseDoesNotSpendAnAttempt() {
        // Being rate limited is nothing to do with this particular receipt.
        // Charging it an attempt would eventually FAIL somebody's perfectly
        // good transfer because Google was busy.
        InstapayTopUpRequest row = row(InstapayRequestStatus.PROCESSING);

        transitions.releaseToPending(requestId);

        assertThat(row.getStatus()).isEqualTo(InstapayRequestStatus.PENDING);
        assertThat(row.getAttemptCount()).isZero();
    }

    // =========================================================================
    // Claiming
    // =========================================================================

    @Test
    @DisplayName("claiming flips the batch to PROCESSING and hands back only what the read needs")
    void claimFlipsToProcessing() {
        InstapayTopUpRequest pending = InstapayTopUpRequest.builder()
                .userId(userId)
                .storagePath("2026/08/one.jpg")
                .fileSha256("b".repeat(64))
                .status(InstapayRequestStatus.PENDING)
                .attemptCount(0)
                .build();
        pending.setId(requestId);
        when(requestRepository.findPendingForProcessing(5)).thenReturn(java.util.List.of(pending));

        var claimed = transitions.claimBatch(5);

        assertThat(pending.getStatus()).isEqualTo(InstapayRequestStatus.PROCESSING);
        assertThat(claimed).singleElement().satisfies(c -> {
            assertThat(c.id()).isEqualTo(requestId);
            assertThat(c.storagePath()).isEqualTo("2026/08/one.jpg");
        });
    }

    @Test
    @DisplayName("an empty queue credits nothing and touches nothing")
    void emptyQueue() {
        when(requestRepository.findPendingForProcessing(5)).thenReturn(java.util.List.of());

        assertThat(transitions.claimBatch(5)).isEmpty();
        verify(walletTransactionService, never()).recordInstapayTopUpCredit(any(), anyLong(), anyString());
    }
}
