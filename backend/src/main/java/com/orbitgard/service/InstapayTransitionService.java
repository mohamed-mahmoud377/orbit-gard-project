package com.orbitgard.service;

import com.orbitgard.instapay.ReceiptDecision;
import com.orbitgard.receipt.ReceiptReadResult;

import java.util.List;
import java.util.UUID;

/**
 * Every database transaction the InstaPay receipt job makes.
 *
 * The job itself holds no transaction boundary and decides nothing about
 * money. It claims rows through here, reads the images outside any
 * transaction — a thirty-second HTTP call has no business holding a row
 * lock — and comes back here to write the outcome.
 *
 * That separation is not tidiness. Spring's @Transactional works through a
 * proxy, so a public method calling its own private helper is never
 * intercepted and the annotation on the inner method does nothing at all;
 * TECH-001 already found that trap in AuthServiceImpl.register(). Here it
 * would cost real money rather than neatness: if the credit and the status
 * flip landed in different transactions, a process that died between them
 * would credit a wallet and leave the row queued for the next run to credit
 * again. Keeping the boundary on a call between two beans is what makes it
 * real, so the job must depend on THIS type and never on the
 * implementation class.
 */
public interface InstapayTransitionService {

    /**
     * A row the job has claimed, flattened to what it needs to do the read.
     *
     * A record rather than the entity, because the entity would cross a
     * transaction boundary and arrive detached, with any lazy state ready
     * to fail somewhere far from here.
     */
    record ClaimedReceipt(UUID id, String storagePath) {
    }

    /**
     * Takes a batch of queued rows and marks them PROCESSING.
     *
     * The claim uses SELECT ... FOR UPDATE SKIP LOCKED, so two instances of
     * the application can never take the same row: the second steps over
     * anything the first is holding instead of blocking on it. Orbit runs
     * one instance today and this still costs nothing.
     *
     * The flip to PROCESSING is committed before the read starts, which is
     * also what puts the row into the state ORB-013 shows the user while
     * their image is being looked at.
     */
    List<ClaimedReceipt> claimBatch(int limit);

    /**
     * Applies the rules and writes the outcome — the only method here that
     * touches money.
     *
     * Everything it does is one transaction: the duplicate-reference
     * lookup, the credit, the link from the receipt to the transaction, and
     * the status flip.
     *
     * @return what was decided, or null when the row had already been
     *         settled by somebody else and was left alone
     */
    ReceiptDecision settle(UUID requestId, ReceiptReadResult read);

    /**
     * Marks a row rejected as a duplicate after the database refused the
     * credit.
     *
     * Reached only when two images of the same transfer are settled close
     * enough together that both passed the lookup in settle(). The insert
     * loses to the partial unique index, that whole transaction rolls back,
     * and the outcome has to be written again on its own.
     */
    void markDuplicateReference(UUID requestId);

    /**
     * Records an attempt that never got an answer.
     *
     * FAILED means only that: no answer was ever obtained. A row the model
     * answered is COMPLETED or REJECTED and is never looked at again,
     * because asking the same question about the same image costs money and
     * returns the same thing.
     *
     * @param read may be null when the failure happened before any call was
     *             made — a stored file that will not load spent nothing
     */
    void recordReadFailure(UUID requestId, ReceiptReadResult read, int maxAttempts);

    /**
     * Puts a claimed row back in the queue without spending one of its
     * attempts.
     *
     * For when the job stops for a reason that has nothing to do with this
     * particular receipt — being rate limited, or the batch being abandoned
     * behind one. Burning a receipt's three attempts on a global condition
     * would eventually FAIL somebody's perfectly good transfer because
     * Google was busy.
     */
    void releaseToPending(UUID requestId);

    /**
     * Returns anything a crash left in PROCESSING to the queue.
     *
     * Safe only because it runs at startup, where there is no in-flight
     * work to collide with. See the repository query for what would have to
     * change if Orbit ever ran more than one instance.
     *
     * @return how many rows were released
     */
    int releaseStrandedRows();
}
