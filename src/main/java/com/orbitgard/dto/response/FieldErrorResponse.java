package com.orbitgard.dto.response;

/**
 * One entry in ErrorResponse.fieldErrors. Present only when something
 * the user typed is wrong — names the exact form field so the client
 * can attach the message under the right input.
 */
public record FieldErrorResponse(
        String field,
        String code
) {
    public static Builder builder() {
        return new Builder();
    }

    public static final class Builder {
        private String field;
        private String code;

        public Builder field(String field) {
            this.field = field;
            return this;
        }

        public Builder code(String code) {
            this.code = code;
            return this;
        }

        public FieldErrorResponse build() {
            return new FieldErrorResponse(field, code);
        }
    }
}
