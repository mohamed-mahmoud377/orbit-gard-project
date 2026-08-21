-- Make room for the top-up service fee in the charged amount.
--
-- V15 split credit_cents out of amount_cents but left chk_payment_amount at
-- its original ceiling of 2,000,000 (EGP 20,000). amount_cents now means the


ALTER TABLE payment
    DROP CONSTRAINT IF EXISTS chk_payment_amount;

-- 2,020,000 = EGP 20,000 credit + 1% fee, the largest charge Orbit can now
-- produce. The floor stays at the EGP 50 minimum.
ALTER TABLE payment
    ADD CONSTRAINT chk_payment_amount
        CHECK (amount_cents >= 5000 AND amount_cents <= 2020000);

-- The wallet credit keeps the original EGP 50 – EGP 20,000 range, because
-- that is the range the user chooses and the one the top-up screen shows.
ALTER TABLE payment
    DROP CONSTRAINT IF EXISTS chk_payment_credit;

ALTER TABLE payment
    ADD CONSTRAINT chk_payment_credit
        CHECK (credit_cents >= 5000 AND credit_cents <= 2000000);

-- A charge below the credit would mean paying out more than was taken.
-- Equality is allowed: rows backfilled by V15 predate the fee and have both
-- columns equal.
ALTER TABLE payment
    DROP CONSTRAINT IF EXISTS chk_payment_credit_not_above_charge;

ALTER TABLE payment
    ADD CONSTRAINT chk_payment_credit_not_above_charge
        CHECK (credit_cents <= amount_cents);
