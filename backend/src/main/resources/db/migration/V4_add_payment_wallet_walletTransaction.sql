CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Payments
CREATE TABLE payment (
                         id UUID PRIMARY KEY,
                         user_id UUID NOT NULL,
                         amount_cents INTEGER NOT NULL,
                         currency VARCHAR(3) NOT NULL DEFAULT 'EGP',
                         status VARCHAR(24) NOT NULL,
                         paymob_intention_id VARCHAR(64),
                         failure_reason VARCHAR(255),
                         created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                         updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                         CONSTRAINT fk_payment_user
                             FOREIGN KEY (user_id)
                                 REFERENCES users(id),
                         CONSTRAINT chk_payment_amount
                             CHECK (
                                 amount_cents >= 5000
                                     AND amount_cents <= 2000000
                                 )
);

CREATE INDEX idx_payment_user_id
    ON payment (user_id);
CREATE INDEX idx_payment_status_created_at
    ON payment (status, created_at);

CREATE TRIGGER trg_payment_updated_at
    BEFORE UPDATE ON payment
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Wallets
CREATE TABLE wallet (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        user_id UUID NOT NULL,
                        balance_cents BIGINT NOT NULL DEFAULT 0,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        CONSTRAINT uq_wallet_user_id
                            UNIQUE (user_id),
                        CONSTRAINT fk_wallet_user
                            FOREIGN KEY (user_id)
                                REFERENCES users(id),
                        CONSTRAINT chk_wallet_balance_non_negative
                            CHECK (
                                balance_cents >= 0
                                )
);

CREATE TRIGGER trg_wallet_updated_at
    BEFORE UPDATE ON wallet
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Wallet transactions
CREATE TABLE wallet_transaction (
                                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                                    wallet_id UUID NOT NULL,
                                    payment_id UUID,
                                    type VARCHAR(24) NOT NULL,
                                    amount_cents BIGINT NOT NULL,
                                    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                    CONSTRAINT fk_wallet_transaction_wallet
                                        FOREIGN KEY (wallet_id)
                                            REFERENCES wallet(id),
                                    CONSTRAINT fk_wallet_transaction_payment
                                        FOREIGN KEY (payment_id)
                                            REFERENCES payment(id)
);

CREATE INDEX idx_wallet_transaction_wallet_id
    ON wallet_transaction (wallet_id);