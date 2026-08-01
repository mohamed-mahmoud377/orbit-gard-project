package com.orbitgard.dto.response;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * The single error shape every endpoint returns, as application/problem+json.
 *
 * fieldErrors is populated only for validation failures, and holds every
 * field that failed at once — never just the first one — so the caller
 * can show all problems together instead of one at a time.
 */
public record ErrorResponse(
        String type,
        String title,
        int status,
        String code,
        String detail,
        String instance,
        OffsetDateTime timestamp,
        String traceId,
        List<FieldErrorResponse> fieldErrors
) {
    public static Builder builder() {
        return new Builder();
    }

    public static final class Builder {
        private String type;
        private String title;
        private int status;
        private String code;
        private String detail;
        private String instance;
        private OffsetDateTime timestamp;
        private String traceId;
        private List<FieldErrorResponse> fieldErrors;

        public Builder type(String type) {
            this.type = type;
            return this;
        }

        public Builder title(String title) {
            this.title = title;
            return this;
        }

        public Builder status(int status) {
            this.status = status;
            return this;
        }

        public Builder code(String code) {
            this.code = code;
            return this;
        }

        public Builder detail(String detail) {
            this.detail = detail;
            return this;
        }

        public Builder instance(String instance) {
            this.instance = instance;
            return this;
        }

        public Builder timestamp(OffsetDateTime timestamp) {
            this.timestamp = timestamp;
            return this;
        }

        public Builder traceId(String traceId) {
            this.traceId = traceId;
            return this;
        }

        public Builder fieldErrors(List<FieldErrorResponse> fieldErrors) {
            this.fieldErrors = fieldErrors;
            return this;
        }

        public ErrorResponse build() {
            return new ErrorResponse(type, title, status, code, detail, instance, timestamp, traceId, fieldErrors);
        }
    }
}
