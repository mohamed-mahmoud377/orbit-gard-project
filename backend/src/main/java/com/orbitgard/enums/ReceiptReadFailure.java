package com.orbitgard.enums;

public enum ReceiptReadFailure {

    /** Timeout, connection reset, 5xx. Retry. */
    TRANSPORT_ERROR,

    /** 429. Retry, but back off first. */
    RATE_LIMITED,

    /** finishReason was not STOP — most likely MAX_TOKENS, so the JSON is truncated. */
    INCOMPLETE_RESPONSE,

    /** The envelope arrived but carried no text part to parse. */
    EMPTY_RESPONSE,

    /** The inner payload was not valid JSON, or failed the shape constraints. */
    MALFORMED_EXTRACTION
}