CREATE TABLE users (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

                       account_type VARCHAR(10) NOT NULL,
                       status VARCHAR(24) NOT NULL,

                       first_name VARCHAR(30) NOT NULL,
                       last_name VARCHAR(30) NOT NULL,

                       username VARCHAR(30) NOT NULL,

                       email VARCHAR(255),
                       pending_email VARCHAR(255),

                       phone_number VARCHAR(13),

                       password_hash VARCHAR(72) NOT NULL,

                       parent_id UUID,

                       promo_code_entered VARCHAR(32),

                       created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                       updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

                       CONSTRAINT uq_users_username
                           UNIQUE (username),

                       CONSTRAINT uq_users_email
                           UNIQUE (email),

                       CONSTRAINT uq_users_phone_number
                           UNIQUE (phone_number),

                       CONSTRAINT fk_users_parent
                           FOREIGN KEY (parent_id)
                               REFERENCES users(id),

                       CONSTRAINT chk_users_username_format
                           CHECK (
                               username ~ '^[a-z0-9._-]{3,30}$'
),

    CONSTRAINT chk_users_first_name
        CHECK (
            first_name ~ '^[A-Za-z]+([ ''-][A-Za-z]+)*$'
        ),

    CONSTRAINT chk_users_last_name
        CHECK (
            last_name ~ '^[A-Za-z]+([ ''-][A-Za-z]+)*$'
        ),

    CONSTRAINT chk_users_phone_number
        CHECK (
            phone_number IS NULL
            OR phone_number ~ '^\+20(10|11|12|15)[0-9]{8}$'
        )
);

--Trigger function for account updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS
$$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE verification_token (
                                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                                    user_id UUID NOT NULL,
                                    token_hash VARCHAR(64) NOT NULL,
                                    purpose VARCHAR(24) NOT NULL,
                                    target_email VARCHAR(255) NOT NULL,
                                    expires_at TIMESTAMPTZ NOT NULL,
                                    consumed_at TIMESTAMPTZ,

                                    CONSTRAINT fk_verification_token_user
                                        FOREIGN KEY (user_id) REFERENCES users(id)
                                            ON DELETE CASCADE,

                                    CONSTRAINT uq_verification_token_hash
                                        UNIQUE (token_hash)

);

CREATE INDEX idx_verification_token_user_id ON verification_token(user_id);
CREATE INDEX idx_verification_token_purpose_consumed ON verification_token(purpose, consumed_at);
CREATE TABLE session (

                         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

                         user_id UUID NOT NULL,

                         refresh_token_hash VARCHAR(64) NOT NULL,

                         previous_refresh_token_hash VARCHAR(64),

                         remember_me BOOLEAN NOT NULL,

                         device_label VARCHAR(120),

                         user_agent VARCHAR(400),

                         ip_address INET,

                         last_used_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

                         idle_expires_at TIMESTAMPTZ NOT NULL,

                         absolute_expires_at TIMESTAMPTZ NOT NULL,

                         revoked_at TIMESTAMPTZ,

                         revoked_reason VARCHAR(24),

                         CONSTRAINT fk_session_user
                             FOREIGN KEY (user_id)
                                 REFERENCES users(id)
                                 ON DELETE CASCADE,

                         CONSTRAINT uq_session_refresh_token_hash
                             UNIQUE (refresh_token_hash),

                         CONSTRAINT chk_session_expiration
                             CHECK (
                                 idle_expires_at <= absolute_expires_at
                                 ),

                         CONSTRAINT chk_session_revoked
                             CHECK (
                                 (revoked_at IS NULL AND revoked_reason IS NULL)
                                     OR
                                 (revoked_at IS NOT NULL AND revoked_reason IS NOT NULL)
                                 )



);