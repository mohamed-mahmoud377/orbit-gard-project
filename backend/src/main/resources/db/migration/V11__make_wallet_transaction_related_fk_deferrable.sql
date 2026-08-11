ALTER TABLE wallet_transaction
    ALTER CONSTRAINT fk_wallet_transaction_related
    DEFERRABLE INITIALLY DEFERRED;