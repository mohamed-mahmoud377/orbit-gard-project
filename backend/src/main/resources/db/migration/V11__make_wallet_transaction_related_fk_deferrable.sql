ALTER TABLE wallet_transaction
ALTER CONSTRAINT fk_wallet_transaction_related
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE wallet_transaction
DROP COLUMN transaction_public_id;