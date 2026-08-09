CREATE TABLE promo_code (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(32) NOT NULL,
    reward_amount_cents BIGINT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_promo_code_code UNIQUE (code),
    CONSTRAINT chk_promo_code_reward_positive CHECK (reward_amount_cents > 0)
);

CREATE TRIGGER trg_promo_code_updated_at
    BEFORE UPDATE ON promo_code
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

INSERT INTO promo_code (code, reward_amount_cents, expires_at)
VALUES
    ('WELCOME500', 50000, '2030-12-31T23:59:59+00:00'),
    ('ORBIT', 20000, '2030-12-31T23:59:59+00:00');
