-- Drop constraints from V7 (held_cents constraints)
ALTER TABLE wallet DROP CONSTRAINT IF EXISTS chk_wallet_held_non_negative;
ALTER TABLE wallet DROP CONSTRAINT IF EXISTS chk_wallet_held_not_above_balance;

-- Drop constraints from V8 (amount and balance constraints)
ALTER TABLE wallet_transaction DROP CONSTRAINT IF EXISTS chk_wallet_transaction_amount_positive;
ALTER TABLE wallet_transaction DROP CONSTRAINT IF EXISTS chk_wallet_transaction_balances_non_negative;

-- Drop constraints from V9 (type, direction, status, and business logic constraints)
ALTER TABLE wallet_transaction DROP CONSTRAINT IF EXISTS chk_wallet_transaction_type;
ALTER TABLE wallet_transaction DROP CONSTRAINT IF EXISTS chk_wallet_transaction_direction;
ALTER TABLE wallet_transaction DROP CONSTRAINT IF EXISTS chk_wallet_transaction_status;
ALTER TABLE wallet_transaction DROP CONSTRAINT IF EXISTS chk_wallet_transaction_type_direction;
ALTER TABLE wallet_transaction DROP CONSTRAINT IF EXISTS chk_wallet_transaction_resolution;

-- Drop trigger and function from V9 (immutability enforcement)
DROP TRIGGER IF EXISTS trg_wallet_transaction_immutable ON wallet_transaction;
DROP FUNCTION IF EXISTS enforce_wallet_transaction_immutability();
