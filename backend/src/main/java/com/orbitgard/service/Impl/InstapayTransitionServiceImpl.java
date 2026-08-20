package com.orbitgard.service.Impl;

import com.orbitgard.entity.InstapayTopUpRequest;
import com.orbitgard.entity.Wallet;
import com.orbitgard.entity.WalletTransaction;
import com.orbitgard.enums.InstapayRejectionReason;
import com.orbitgard.enums.InstapayRequestStatus;
import com.orbitgard.instapay.ReceiptDecision;
import com.orbitgard.instapay.ReceiptRules;
import com.orbitgard.mapper.InstapayReceiptMapper;
import com.orbitgard.receipt.ReceiptReadResult;
import com.orbitgard.repository.InstapayTopUpRequestRepository;
import com.orbitgard.service.InstapayTransitionService;
import com.orbitgard.service.WalletService;
import com.orbitgard.service.WalletTransactionService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * Where the InstaPay transaction boundaries actually live.
 *
 * The contract and the reasoning behind the split are on
 * InstapayTransitionService. What matters here is that every @Transactional
 * below is entered from outside this class — the job calls the interface,
 * Spring's proxy intercepts, and the boundary is where the annotation says
 * it is. Nothing in this file may call another public method on `this` and
 * expect a new transaction, because that call would go straight to the
 * object and skip the proxy entirely.
 *
 * The model call is deliberately absent. It happens in the job, between
 * claimBatch and settle, holding no lock and no connection.
 */
@Service
@Slf4j
public class InstapayTransitionServiceImpl implements InstapayTransitionService {

    private final InstapayTopUpRequestRepository requestRepository;
    private final InstapayReceiptMapper mapper;
    private final ReceiptRules rules;
    private final WalletService walletService;
    private final WalletTransactionService walletTransactionService;

    public InstapayTransitionServiceImpl(InstapayTopUpRequestRepository requestRepository,
                                         InstapayReceiptMapper mapper,
                                         ReceiptRules rules,
                                         WalletService walletService,
                                         WalletTransactionService walletTransactionService) {
        this.requestRepository = requestRepository;
        this.mapper = mapper;
        this.rules = rules;
        this.walletService = walletService;
        this.walletTransactionService = walletTransactionService;
    }

    @Override
    @Transactional
    public List<ClaimedReceipt> claimBatch(int limit) {
        List<InstapayTopUpRequest> claimed = requestRepository.findPendingForProcessing(limit);

        for (InstapayTopUpRequest row : claimed) {
            row.setStatus(InstapayRequestStatus.PROCESSING);
        }
        requestRepository.saveAll(claimed);

        return claimed.stream()
                .map(row -> new ClaimedReceipt(row.getId(), row.getStoragePath()))
                .toList();
    }

    @Override
    @Transactional
    public ReceiptDecision settle(UUID requestId, ReceiptReadResult read) {
        InstapayTopUpRequest row = requestRepository.findByIdForUpdate(requestId)
                .orElseThrow(() -> new NoSuchElementException("InstaPay request not found: " + requestId));

        if (row.getStatus() != InstapayRequestStatus.PROCESSING) {
            // Somebody already settled this. Not an error and not worth an
            // exception — but it is worth refusing to do it twice.
            log.warn("InstaPay request {} was already {} — not settling again", requestId, row.getStatus());
            return null;
        }

        mapper.applyExtraction(row, read.extraction());
        mapper.applyCost(row, read);

        // The duplicate lookup runs inside this transaction, next to the
        // insert it is guarding. It is still only a check: the guarantee is
        // the partial unique index on credited rows, which is what catches
        // two images of one transfer arriving in the same instant. The job
        // handles that constraint violation.
        ReceiptDecision decision = rules.decide(
                read.extraction(),
                reference -> requestRepository.existsByReferenceNumberAndStatus(
                        reference, InstapayRequestStatus.COMPLETED));

        if (decision.credited()) {
            Wallet wallet = walletService.requireByUserId(row.getUserId());

            WalletTransaction transaction = walletTransactionService.recordInstapayTopUpCredit(
                    wallet.getId(),
                    decision.creditCents(),
                    row.getReferenceNumber());

            row.setTransactionId(transaction.getId());
            row.setStatus(InstapayRequestStatus.COMPLETED);
        } else {
            // The code, never the sentence. The wording lives in the
            // frontend catalogue so it can be improved without a migration.
            row.setRejectionReason(decision.rejectionReason());
            row.setStatus(InstapayRequestStatus.REJECTED);
        }

        row.setResolvedAt(OffsetDateTime.now(ZoneOffset.UTC));
        requestRepository.save(row);

        return decision;
    }

    @Override
    @Transactional
    public void markDuplicateReference(UUID requestId) {
        InstapayTopUpRequest row = requestRepository.findByIdForUpdate(requestId)
                .orElseThrow(() -> new NoSuchElementException("InstaPay request not found: " + requestId));

        if (row.getStatus() != InstapayRequestStatus.PROCESSING) {
            return;
        }

        row.setRejectionReason(InstapayRejectionReason.DUPLICATE_REFERENCE);
        row.setStatus(InstapayRequestStatus.REJECTED);
        row.setResolvedAt(OffsetDateTime.now(ZoneOffset.UTC));
        requestRepository.save(row);
    }

    @Override
    @Transactional
    public void recordReadFailure(UUID requestId, ReceiptReadResult read, int maxAttempts) {
        InstapayTopUpRequest row = requestRepository.findByIdForUpdate(requestId)
                .orElseThrow(() -> new NoSuchElementException("InstaPay request not found: " + requestId));

        if (row.getStatus() != InstapayRequestStatus.PROCESSING) {
            return;
        }

        // The cost is recorded even though nothing was read. A malformed
        // response and a timeout after the model answered both cost a call,
        // and only a row that never reached the model has nothing to add.
        mapper.applyCost(row, read);

        row.setAttemptCount(row.getAttemptCount() + 1);

        if (row.getAttemptCount() >= maxAttempts) {
            row.setStatus(InstapayRequestStatus.FAILED);
            row.setResolvedAt(OffsetDateTime.now(ZoneOffset.UTC));
        } else {
            row.setStatus(InstapayRequestStatus.PENDING);
        }

        requestRepository.save(row);
    }

    @Override
    @Transactional
    public void releaseToPending(UUID requestId) {
        requestRepository.findByIdForUpdate(requestId).ifPresent(row -> {
            if (row.getStatus() == InstapayRequestStatus.PROCESSING) {
                row.setStatus(InstapayRequestStatus.PENDING);
                requestRepository.save(row);
            }
        });
    }

    @Override
    @Transactional
    public int releaseStrandedRows() {
        return requestRepository.releaseAllProcessing();
    }
}
