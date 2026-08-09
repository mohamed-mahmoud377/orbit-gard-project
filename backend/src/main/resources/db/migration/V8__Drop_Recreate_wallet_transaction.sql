DROP TABLE IF EXISTS wallet_transaction;

CREATE TABLE wallet_transaction (
                                    id UUID PRIMARY KEY,

                                    wallet_id UUID NOT NULL,

                                    type VARCHAR(24) NOT NULL,
                                    direction VARCHAR(10) NOT NULL,
                                    status VARCHAR(16) NOT NULL,

                                    amount_cents BIGINT NOT NULL,

                                    balance_before_cents BIGINT NOT NULL,
                                    balance_after_cents BIGINT NOT NULL,

                                    reference VARCHAR(32) NOT NULL,
                                    transaction_public_id VARCHAR(32) NOT NULL,
                                    description VARCHAR(500),

                                    counterparty VARCHAR(255),
                                    counterparty_wallet_id UUID,
                                    related_transaction_id UUID,

                                    payment_id UUID,

                                    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                    resolved_at TIMESTAMPTZ,

                                    CONSTRAINT uq_wallet_transaction_reference UNIQUE (reference),
                                    CONSTRAINT uq_wallet_transaction_public_id UNIQUE (transaction_public_id),

                                    CONSTRAINT fk_wallet_transaction_wallet FOREIGN KEY (wallet_id) REFERENCES wallet(id),
                                    CONSTRAINT fk_wallet_transaction_counterparty_wallet FOREIGN KEY (counterparty_wallet_id) REFERENCES wallet(id),
                                    CONSTRAINT fk_wallet_transaction_related FOREIGN KEY (related_transaction_id) REFERENCES wallet_transaction(id),
                                    CONSTRAINT fk_wallet_transaction_payment FOREIGN KEY (payment_id) REFERENCES payment(id),

                                    CONSTRAINT chk_wallet_transaction_amount_positive CHECK (amount_cents > 0),
                                    CONSTRAINT chk_wallet_transaction_balances_non_negative CHECK (balance_before_cents >= 0 AND balance_after_cents >= 0)
);

CREATE INDEX idx_wallet_transaction_wallet_id_created_at ON wallet_transaction (wallet_id, created_at);
CREATE INDEX idx_wallet_transaction_status ON wallet_transaction (status) WHERE status = 'PENDING';
