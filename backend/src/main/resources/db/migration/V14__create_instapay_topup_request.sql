-- InstaPay top-up requests (ORB-013 / TECH-003).
--
-- This table is also the job queue: a row in PENDING is a queued job.
--
-- Deliberately free of CHECK constraints. Unlike wallet_transaction, whose
-- invariants are enforced in V9, every value here originates from a model
-- reading a photograph. The application decides what is acceptable and
-- records the outcome in status and rejection_reason; the database only
-- stores what was read. A CHECK here would turn a receipt the rules should
-- reject with a readable reason into a 500 at insert time.
--
-- Types, keys and indexes only.

CREATE TABLE instapay_topup_request (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL,

    -- The stored file
    storage_path      VARCHAR(512) NOT NULL,
    original_filename VARCHAR(255),
    content_type      VARCHAR(100),
    size_bytes        BIGINT,
    file_sha256       VARCHAR(64) NOT NULL,

    -- Queue state
    status        VARCHAR(16) NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,

    -- Read out of the image. All nullable, and all null until the job runs.
    -- A collapsed "More Details" section genuinely leaves the reference out
    -- of the picture, and that null has to survive to the rules.
    is_transfer_receipt   BOOLEAN,
    is_successful         BOOLEAN,
    amount_cents          BIGINT,
    amount_as_shown       VARCHAR(64),
    currency              VARCHAR(3),
    fees_cents            BIGINT,
    total_amount_cents    BIGINT,
    reference_number      VARCHAR(64),
    recipient_name_masked VARCHAR(128),
    recipient_phone       VARCHAR(20),
    sender_handle         VARCHAR(128),
    sender_bank           VARCHAR(128),

    -- TIMESTAMP, not TIMESTAMPTZ: a receipt prints a wall-clock time with no
    -- offset on it anywhere. Storing it as TIMESTAMPTZ would attach a zone
    -- the image never contained.
    transfer_date_time    TIMESTAMP,

    note                  VARCHAR(512),

    -- What the read cost. Separate columns because output tokens cost several
    -- times what input tokens do, so one total cannot be priced.
    input_tokens     INTEGER NOT NULL DEFAULT 0,
    output_tokens    INTEGER NOT NULL DEFAULT 0,
    model            VARCHAR(64),
    call_duration_ms BIGINT,

    -- Outcome. The code, never the sentence.
    rejection_reason VARCHAR(32),
    transaction_id   UUID,

    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMPTZ,

    CONSTRAINT fk_instapay_topup_request_user
        FOREIGN KEY (user_id)
            REFERENCES users(id),

    CONSTRAINT fk_instapay_topup_request_transaction
        FOREIGN KEY (transaction_id)
            REFERENCES wallet_transaction(id)
);

-- ---------------------------------------------------------------------------
-- The two indexes that are the feature
-- ---------------------------------------------------------------------------

-- The lazy duplicate: the same image uploaded twice. Caught at upload, before
-- any money or any API call is involved. Global rather than per-user, because
-- one image is one real transfer no matter who holds it.
CREATE UNIQUE INDEX uq_instapay_topup_request_file_sha256
    ON instapay_topup_request (file_sha256);

-- The deliberate duplicate: crop one pixel, recompress, and the hash changes
-- while the transfer underneath is the same. This is what actually stops one
-- transfer becoming two credits.
--
-- Partial, on credited rows only. A blanket unique index would permanently
-- lock out a real case: a user screenshots a transfer while their bank still
-- shows it pending, gets TRANSFER_NOT_SUCCESSFUL, and uploads the completed
-- confirmation an hour later. Same reference, same real transfer, genuinely
-- their money -- and there is no reviewer to appeal to. A reference is
-- reserved when it is credited, not when it is read.
CREATE UNIQUE INDEX uq_instapay_topup_request_reference_credited
    ON instapay_topup_request (reference_number)
    WHERE status = 'COMPLETED' AND reference_number IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Supporting indexes
-- ---------------------------------------------------------------------------

-- The requests page: this user's requests, newest first.
CREATE INDEX idx_instapay_topup_request_user_created
    ON instapay_topup_request (user_id, created_at DESC);

-- The job claiming a batch of PENDING rows, oldest first.
CREATE INDEX idx_instapay_topup_request_status_created
    ON instapay_topup_request (status, created_at);
