package com.orbitgard.scheduler;

import com.orbitgard.enums.ReceiptReadFailure;
import com.orbitgard.instapay.InstapayProperties;
import com.orbitgard.instapay.ReceiptDecision;
import com.orbitgard.receipt.ReceiptReadResult;
import com.orbitgard.receipt.ReceiptReader;
import com.orbitgard.service.InstapayTransitionService;
import com.orbitgard.service.InstapayTransitionService.ClaimedReceipt;
import com.orbitgard.service.InstapayStorageService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

/**
 * The queue, drained.
 *
 * The table is the queue — a row in PENDING is a queued job — which is why
 * this feature has no broker. Postgres already does everything a queue of
 * this size needs, and Redis, RabbitMQ and Kafka are all on Orbit's
 * rejected list.
 *
 * Fixed delay, not fixed rate. Fixed rate fires on a clock and will start a
 * second run on top of a slow first one; fixed delay waits for the previous
 * run to finish. For a job whose work is network calls that difference is
 * the whole ballgame.
 *
 * Nothing here decides anything. It claims rows, reads images, and hands
 * each result to InstapayTransitionService, which owns every transaction
 * and every rule. This class only chooses what to do next when something
 * goes wrong.
 */
@Component
@Slf4j
public class InstapayReceiptJob {

    private final InstapayProperties props;
    private final InstapayTransitionService transitions;
    private final InstapayStorageService storageService;
    private final ReceiptReader receiptReader;

    public InstapayReceiptJob(InstapayProperties props,
                              InstapayTransitionService transitions,
                              InstapayStorageService storageService,
                              ReceiptReader receiptReader) {
        this.props = props;
        this.transitions = transitions;
        this.storageService = storageService;
        this.receiptReader = receiptReader;
    }

    /**
     * Anything a crash left mid-flight goes back in the queue.
     *
     * Without this a receipt caught by a restart sits in PROCESSING
     * forever: the job only ever claims PENDING rows, so nothing would look
     * at it again, and ORB-013 promises a request is resolved without any
     * human action.
     */
    @EventListener(ApplicationReadyEvent.class)
    public void releaseStrandedRowsOnStartup() {
        if (!props.getJob().isEnabled()) {
            return;
        }

        int released = transitions.releaseStrandedRows();
        if (released > 0) {
            log.warn("InstaPay job: returned {} row(s) stranded in PROCESSING to the queue", released);
        }
    }

    /**
     * Batch size is five for a reason worth keeping. The free tier allows
     * roughly fifteen requests a minute; a batch of ten every thirty
     * seconds is twenty a minute and starts collecting 429s. Five is ten a
     * minute, comfortably inside, and still far more throughput than this
     * feature will ever need.
     */
    @Scheduled(fixedDelayString = "${orbitgard.instapay.job.fixed-delay:30s}")
    public void processPendingReceipts() {
        // Checked here rather than with @ConditionalOnProperty so the bean
        // always exists and the flag can be flipped without changing which
        // beans the context holds — and so a test can drive the method
        // directly regardless of configuration.
        if (!props.getJob().isEnabled()) {
            return;
        }

        List<ClaimedReceipt> batch = transitions.claimBatch(props.getJob().getBatchSize());
        if (batch.isEmpty()) {
            return;
        }

        log.info("InstaPay job: claimed {} receipt(s)", batch.size());

        for (int i = 0; i < batch.size(); i++) {
            ClaimedReceipt claimed = batch.get(i);

            if (!processOne(claimed)) {
                // Rate limited. Stop the run rather than walking into the
                // rest of the 429s, and put back everything that has not
                // been looked at — none of those rows has been attempted,
                // so none of them should spend an attempt.
                releaseRemaining(batch.subList(i + 1, batch.size()));
                return;
            }
        }
    }

    /**
     * @return false when the run should stop — rate limiting is the only
     *         reason, because it is the one failure that will hit every
     *         remaining row in the batch just as hard
     */
    private boolean processOne(ClaimedReceipt claimed) {
        byte[] imageBytes;
        try {
            imageBytes = storageService.readFile(claimed.storagePath());
        } catch (IOException | SecurityException e) {
            // The row points at a file that will not load. Nothing was
            // spent, and three goes at a missing file is a decent way to
            // tell a transient disk problem from a permanent one.
            log.error("InstaPay receipt {}: stored image could not be read", claimed.id(), e);
            transitions.recordReadFailure(claimed.id(), null, props.getJob().getMaxAttempts());
            return true;
        }

        // The one call that costs money. Deliberately outside every
        // transaction — the read timeout alone is thirty seconds.
        ReceiptReadResult read = receiptReader.read(imageBytes);

        if (!read.successful()) {
            if (read.failure() == ReceiptReadFailure.RATE_LIMITED) {
                // Never an immediate retry. The fixed delay is the backoff,
                // and it costs nothing to build.
                log.warn("InstaPay job: rate limited, abandoning the rest of this run");
                transitions.releaseToPending(claimed.id());
                return false;
            }

            log.warn("InstaPay receipt {}: read failed, failure={} inputTokens={} outputTokens={} callMs={}",
                    claimed.id(), read.failure(), read.inputTokens(), read.outputTokens(),
                    read.callDuration() == null ? 0 : read.callDuration().toMillis());
            transitions.recordReadFailure(claimed.id(), read, props.getJob().getMaxAttempts());
            return true;
        }

        settle(claimed, read);
        return true;
    }

    private void settle(ClaimedReceipt claimed, ReceiptReadResult read) {
        ReceiptDecision decision;
        try {
            decision = transitions.settle(claimed.id(), read);
        } catch (DataIntegrityViolationException e) {
            // The partial unique index on credited rows refused the credit:
            // another image of the same transfer got there first, close
            // enough that both passed the lookup. The settle transaction is
            // already rolled back, so the outcome is written again on its
            // own.
            log.warn("InstaPay receipt {}: reference already credited, rejecting as a duplicate", claimed.id());
            transitions.markDuplicateReference(claimed.id());
            return;
        } catch (RuntimeException e) {
            // One bad row must not take the rest of the batch with it. The
            // transaction rolled back, so the row is still PROCESSING and
            // startup recovery will pick it up; nothing was credited.
            log.error("InstaPay receipt {}: settlement failed", claimed.id(), e);
            return;
        }

        if (decision == null) {
            return;
        }

        // Everything needed to answer both "why was this rejected" and
        // "what did today cost", and nothing that would put somebody's bank,
        // handle or masked name in a log file.
        log.info("InstaPay receipt {}: outcome={} reason={} inputTokens={} outputTokens={} callMs={}",
                claimed.id(),
                decision.outcome(),
                decision.rejectionReason(),
                read.inputTokens(),
                read.outputTokens(),
                read.callDuration() == null ? 0 : read.callDuration().toMillis());
    }

    private void releaseRemaining(List<ClaimedReceipt> remaining) {
        for (ClaimedReceipt claimed : remaining) {
            UUID id = claimed.id();
            try {
                transitions.releaseToPending(id);
            } catch (RuntimeException e) {
                log.error("InstaPay receipt {}: could not be returned to the queue", id, e);
            }
        }
    }
}
