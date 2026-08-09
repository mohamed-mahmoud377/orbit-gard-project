-- ORB-011: keep the persisted ledger aligned with the transaction model even
-- when a writer bypasses the application service.
ALTER TABLE wallet_transaction
    ADD CONSTRAINT chk_wallet_transaction_type CHECK (
        type IN ('PROMO', 'TOPUP', 'INTERNAL_TRANSFER', 'EXTERNAL_TRANSFER')
    ),
    ADD CONSTRAINT chk_wallet_transaction_direction CHECK (
        direction IN ('CREDIT', 'DEBIT')
    ),
    ADD CONSTRAINT chk_wallet_transaction_status CHECK (
        status IN ('PENDING', 'COMPLETED', 'REJECTED')
    ),
    ADD CONSTRAINT chk_wallet_transaction_type_direction CHECK (
        (type IN ('PROMO', 'TOPUP') AND direction = 'CREDIT')
        OR (type = 'EXTERNAL_TRANSFER' AND direction = 'DEBIT')
        OR type = 'INTERNAL_TRANSFER'
    ),
    ADD CONSTRAINT chk_wallet_transaction_resolution CHECK (
        (status = 'PENDING' AND resolved_at IS NULL)
        OR (status IN ('COMPLETED', 'REJECTED'))
    );

CREATE OR REPLACE FUNCTION enforce_wallet_transaction_immutability()
RETURNS TRIGGER AS
$$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'wallet transactions are immutable and cannot be deleted';
    END IF;

    IF OLD.wallet_id IS DISTINCT FROM NEW.wallet_id
       OR OLD.type IS DISTINCT FROM NEW.type
       OR OLD.direction IS DISTINCT FROM NEW.direction
       OR OLD.amount_cents IS DISTINCT FROM NEW.amount_cents
       OR OLD.balance_before_cents IS DISTINCT FROM NEW.balance_before_cents
       OR OLD.balance_after_cents IS DISTINCT FROM NEW.balance_after_cents
       OR OLD.reference IS DISTINCT FROM NEW.reference
       OR OLD.counterparty IS DISTINCT FROM NEW.counterparty
       OR OLD.counterparty_wallet_id IS DISTINCT FROM NEW.counterparty_wallet_id
       OR OLD.related_transaction_id IS DISTINCT FROM NEW.related_transaction_id
       OR OLD.payment_id IS DISTINCT FROM NEW.payment_id
       OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
        RAISE EXCEPTION 'wallet transaction fields are immutable';
    END IF;

    IF OLD.status <> 'PENDING'
       OR NEW.status NOT IN ('COMPLETED', 'REJECTED')
       OR OLD.resolved_at IS NOT NULL
       OR NEW.resolved_at IS NULL THEN
        RAISE EXCEPTION 'a wallet transaction may only move from PENDING to COMPLETED or REJECTED';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_wallet_transaction_immutable
    BEFORE UPDATE OR DELETE ON wallet_transaction
    FOR EACH ROW
    EXECUTE FUNCTION enforce_wallet_transaction_immutability();
