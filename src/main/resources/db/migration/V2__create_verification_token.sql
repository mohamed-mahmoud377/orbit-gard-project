CREATE TABLE verification_token (
                                    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                                    user_id BIGINT NOT NULL,
                                    token_hash VARCHAR(64) NOT NULL,
                                    purpose VARCHAR(24) NOT NULL,
                                    target_email VARCHAR(255) NOT NULL,
                                    expires_at TIMESTAMPTZ NOT NULL,
                                    consumed_at TIMESTAMPTZ,

                                    CONSTRAINT fk_verification_token_user
                                        FOREIGN KEY (user_id) REFERENCES users(id)
                                            ON DELETE CASCADE,

                                    CONSTRAINT uq_verification_token_hash
                                        UNIQUE (token_hash),

                                    CONSTRAINT chk_verification_token_purpose
                                        CHECK (purpose IN ('EMAIL_VERIFICATION', 'PASSWORD_RESET', 'EMAIL_CHANGE'))
);

CREATE INDEX idx_verification_token_user_id ON verification_token(user_id);
CREATE INDEX idx_verification_token_purpose_consumed ON verification_token(purpose, consumed_at);