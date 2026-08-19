package com.orbitgard.enums;

/**
 * Where an uploaded receipt has got to.
 *
 * PENDING is also the job queue — a row in this state is a queued job, which
 * is why this feature needs no broker.
 *
 * COMPLETED and REJECTED are terminal: the model answered and a decision was
 * made, so the row is never looked at again. FAILED means only that no
 * answer was ever obtained, which is why it is the one non-terminal ending.
 */
public enum InstapayRequestStatus {
    PENDING,
    PROCESSING,
    COMPLETED,
    REJECTED,
    FAILED
}
