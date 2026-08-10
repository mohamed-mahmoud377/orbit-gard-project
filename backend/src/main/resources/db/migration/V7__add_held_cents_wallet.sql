ALTER TABLE wallet ADD COLUMN held_cents BIGINT NOT NULL DEFAULT 0;

ALTER TABLE wallet ADD CONSTRAINT chk_wallet_held_non_negative CHECK (held_cents >= 0);
ALTER TABLE wallet ADD CONSTRAINT chk_wallet_held_not_above_balance CHECK (held_cents <= balance_cents);