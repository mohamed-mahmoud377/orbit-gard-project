CREATE TABLE spending_limit (

                                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

                                user_id UUID NOT NULL,

                                max_per_transaction NUMERIC(14,2) NOT NULL,
                                daily_limit         NUMERIC(14,2) NOT NULL,
                                monthly_limit       NUMERIC(14,2) NOT NULL,

                                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

                                CONSTRAINT uq_spending_limit_user_id
                                    UNIQUE (user_id),

                                CONSTRAINT fk_spending_limit_user
                                    FOREIGN KEY (user_id)
                                        REFERENCES users(id)
                                        ON DELETE CASCADE,

                                CONSTRAINT chk_spending_limit_positive
                                    CHECK (
                                        max_per_transaction > 0
                                            AND daily_limit > 0
                                            AND monthly_limit > 0
                                        ),

                                CONSTRAINT chk_spending_limit_order
                                    CHECK (
                                        max_per_transaction <= daily_limit
                                            AND daily_limit <= monthly_limit
                                        )
);

CREATE INDEX idx_spending_limit_user_id ON spending_limit(user_id);