ALTER TABLE payment
    ADD COLUMN credit_cents INTEGER;

UPDATE payment
SET credit_cents = amount_cents
WHERE credit_cents IS NULL;

ALTER TABLE payment
    ALTER COLUMN credit_cents SET NOT NULL;

