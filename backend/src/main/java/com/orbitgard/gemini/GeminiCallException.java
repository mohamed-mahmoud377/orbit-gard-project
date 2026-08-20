package com.orbitgard.gemini;

/**
 * The call never produced an answer.
 *
 * Deliberately says nothing about receipts — this package knows only about
 * talking to Gemini. The caller maps a Kind onto its own failure model.
 */
public class GeminiCallException extends RuntimeException {

    public enum Kind {
        /** Timeout, connection reset, 5xx. Retryable. */
        TRANSPORT,
        /** 429. Retryable, but back off first. */
        RATE_LIMITED
    }

    private final Kind kind;

    public GeminiCallException(Kind kind, String message, Throwable cause) {
        super(message, cause);
        this.kind = kind;
    }

    public Kind getKind() {
        return kind;
    }
}
