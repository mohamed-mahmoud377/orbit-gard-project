package com.orbitgard.instapay;

import com.orbitgard.enums.ReceiptReadFailure;
import com.orbitgard.receipt.ReceiptExtraction;
import com.orbitgard.receipt.ReceiptReadResult;
import com.orbitgard.receipt.ReceiptReader;
import com.orbitgard.scheduler.InstapayReceiptJob;
import com.orbitgard.service.InstapayTransitionService;
import com.orbitgard.service.InstapayTransitionService.ClaimedReceipt;
import com.orbitgard.service.InstapayStorageService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

import java.io.IOException;
import java.time.Duration;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

/**
 * What the job does when things go wrong, which is most of what it is for.
 *
 * The happy path is one line — claim, read, settle — and it is
 * InstapayTransitionServiceTest that proves the settling is right. What is
 * worth testing here is the choices this class makes on its own: when to
 * stop the run, when to spend one of a row's attempts, and when to spend
 * none.
 */
class InstapayReceiptJobTest {

    private InstapayProperties props;
    private InstapayTransitionService transitions;
    private InstapayStorageService storageService;
    private ReceiptReader receiptReader;
    private InstapayReceiptJob job;

    private UUID firstId;
    private UUID secondId;

    @BeforeEach
    void setUp() {
        props = new InstapayProperties();
        props.getJob().setBatchSize(5);
        props.getJob().setMaxAttempts(3);

        transitions = mock(InstapayTransitionService.class);
        storageService = mock(InstapayStorageService.class);
        receiptReader = mock(ReceiptReader.class);

        job = new InstapayReceiptJob(props, transitions, storageService, receiptReader);

        firstId = UUID.randomUUID();
        secondId = UUID.randomUUID();
    }

    private void claim(ClaimedReceipt... receipts) {
        when(transitions.claimBatch(5)).thenReturn(List.of(receipts));
    }

    private ClaimedReceipt receipt(UUID id) {
        return new ClaimedReceipt(id, "2026/08/" + id + ".jpg");
    }

    private void storedImageLoads() throws IOException {
        when(storageService.readFile(any())).thenReturn(new byte[]{1, 2, 3});
    }

    private static ReceiptReadResult successfulRead() {
        return ReceiptReadResult.builder()
                .extraction(ReceiptExtraction.builder().isTransferReceipt(true).build())
                .model("gemini-3.1-flash-lite")
                .inputTokens(1487)
                .outputTokens(142)
                .callDuration(Duration.ofMillis(900))
                .build();
    }

    private static ReceiptReadResult failedRead(ReceiptReadFailure failure) {
        return ReceiptReadResult.builder()
                .failure(failure)
                .model("gemini-3.1-flash-lite")
                .inputTokens(1487)
                .outputTokens(0)
                .callDuration(Duration.ofMillis(400))
                .build();
    }

    // =========================================================================

    @Test
    @DisplayName("an empty queue makes no calls at all")
    void emptyQueueCostsNothing() throws IOException {
        when(transitions.claimBatch(5)).thenReturn(List.of());

        job.processPendingReceipts();

        verify(receiptReader, never()).read(any());
        verify(storageService, never()).readFile(any());
    }

    @Test
    @DisplayName("a claimed row is read and settled")
    void happyPath() throws IOException {
        claim(receipt(firstId));
        storedImageLoads();
        ReceiptReadResult read = successfulRead();
        when(receiptReader.read(any())).thenReturn(read);

        job.processPendingReceipts();

        verify(transitions).settle(firstId, read);
    }

    @Test
    @DisplayName("being rate limited abandons the run and spends nobody's attempts")
    void rateLimitedAbandonsTheBatch() throws IOException {
        // Never an immediate retry. The fixed delay between runs is the
        // backoff, and stopping here means at most one call per run while
        // the limit lasts instead of a batch of 429s.
        claim(receipt(firstId), receipt(secondId));
        storedImageLoads();
        when(receiptReader.read(any())).thenReturn(failedRead(ReceiptReadFailure.RATE_LIMITED));

        job.processPendingReceipts();

        // One call made, one row released, and the untouched row put back.
        verify(receiptReader, times(1)).read(any());
        verify(transitions).releaseToPending(firstId);
        verify(transitions).releaseToPending(secondId);
        verify(transitions, never()).recordReadFailure(any(), any(), anyInt());
        verify(transitions, never()).settle(any(), any());
    }

    @Test
    @DisplayName("a transport failure spends an attempt and leaves the rest of the batch alone")
    void transportFailureRetriesJustThatRow() throws IOException {
        claim(receipt(firstId), receipt(secondId));
        storedImageLoads();
        ReceiptReadResult failure = failedRead(ReceiptReadFailure.TRANSPORT_ERROR);
        ReceiptReadResult success = successfulRead();
        when(receiptReader.read(any())).thenReturn(failure, success);

        job.processPendingReceipts();

        verify(transitions).recordReadFailure(firstId, failure, 3);
        verify(transitions).settle(secondId, success);
    }

    @Test
    @DisplayName("a malformed response is retryable, never a rejection")
    void malformedResponseIsRetried() throws IOException {
        // A rejection is terminal and costs the user their upload. A
        // response we could not parse is our problem, not theirs.
        claim(receipt(firstId));
        storedImageLoads();
        ReceiptReadResult failure = failedRead(ReceiptReadFailure.MALFORMED_EXTRACTION);
        when(receiptReader.read(any())).thenReturn(failure);

        job.processPendingReceipts();

        verify(transitions).recordReadFailure(firstId, failure, 3);
        verify(transitions, never()).settle(any(), any());
    }

    @Test
    @DisplayName("a stored image that will not load costs an attempt and no tokens")
    void unreadableFile() throws IOException {
        claim(receipt(firstId));
        when(storageService.readFile(any())).thenThrow(new IOException("gone"));

        job.processPendingReceipts();

        verify(receiptReader, never()).read(any());
        verify(transitions).recordReadFailure(eq(firstId), isNull(), eq(3));
    }

    @Test
    @DisplayName("the unique index refusing a credit becomes DUPLICATE_REFERENCE")
    void constraintViolationBecomesADuplicate() throws IOException {
        // Two images of one transfer, settled close enough together that
        // both passed the lookup. The database is the guarantee; this is
        // how the loser is told.
        claim(receipt(firstId));
        storedImageLoads();
        when(receiptReader.read(any())).thenReturn(successfulRead());
        when(transitions.settle(eq(firstId), any()))
                .thenThrow(new DataIntegrityViolationException("uq_instapay_topup_request_reference_credited"));

        job.processPendingReceipts();

        verify(transitions).markDuplicateReference(firstId);
    }

    @Test
    @DisplayName("one row blowing up does not take the rest of the batch with it")
    void oneBadRowDoesNotStopTheRun() throws IOException {
        claim(receipt(firstId), receipt(secondId));
        storedImageLoads();
        ReceiptReadResult read = successfulRead();
        when(receiptReader.read(any())).thenReturn(read);
        when(transitions.settle(eq(firstId), any())).thenThrow(new IllegalStateException("wallet missing"));

        job.processPendingReceipts();

        verify(transitions).settle(secondId, read);
        // Nothing was credited for the row that threw: its transaction
        // rolled back, and startup recovery will return it to the queue.
        verify(transitions, never()).markDuplicateReference(any());
    }

    @Test
    @DisplayName("rows stranded in PROCESSING by a crash are returned to the queue at startup")
    void startupRecovery() {
        when(transitions.releaseStrandedRows()).thenReturn(2);

        job.releaseStrandedRowsOnStartup();

        verify(transitions).releaseStrandedRows();
        verifyNoMoreInteractions(storageService, receiptReader);
    }
}
