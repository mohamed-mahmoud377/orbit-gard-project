CREATE TABLE session (

                         id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

                         user_id BIGINT NOT NULL,

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
                                 ),

                         CONSTRAINT chk_session_revoked_reason
                             CHECK (
                                 revoked_reason IS NULL
                                     OR revoked_reason IN (

                                                           'LOGOUT',

                                                           'REMOTE_LOGOUT',

                                                           'LOGOUT_ALL',

                                                           'PASSWORD_RESET',

                                                           'PASSWORD_CHANGE',

                                                           'TOKEN_REUSE',

                                                           'EXPIRED'

                                     )
                                 )

);