-- What the InstaPay receipt reader has cost, and what it is doing.
--
-- TECH-003 section 11 asks that one query answer "what has this feature
-- cost so far". That is query 1. The rest are the questions you actually
-- ask next, once the first one has a number in it.
--
-- Prices are per million tokens and are pinned here as literals rather than
-- read from anywhere, because they change and old rows must keep costing
-- what they cost at the time. Check them against Google's pricing page
-- before trusting any figure below, and add a branch to the CASE rather
-- than editing a number when the model changes — that is exactly why the
-- model name is stored alongside the token counts.
--
-- gemini-3.1-flash-lite, as of the writing of TECH-003:
--   input   $0.10 per 1M tokens
--   output  $0.40 per 1M tokens
-- Output is several times the price of input. That ratio is the whole
-- reason the two are separate columns, and it is why "the response got
-- longer" is the change worth watching.


-- ---------------------------------------------------------------------------
-- 1 · What has this feature cost so far
-- ---------------------------------------------------------------------------
SELECT
    COUNT(*)                                          AS receipts,
    SUM(input_tokens)                                 AS input_tokens,
    SUM(output_tokens)                                AS output_tokens,
    ROUND(SUM(
        input_tokens  * 0.10 / 1000000
      + output_tokens * 0.40 / 1000000
    )::numeric, 4)                                    AS usd
FROM instapay_topup_request
WHERE model = 'gemini-3.1-flash-lite';


-- ---------------------------------------------------------------------------
-- 2 · Cost per outcome
--
-- The useful comparison: are rejections costing more than credits? They
-- should cost the same — a rejected receipt is one call, exactly like a
-- credited one — so a large gap means retries are concentrated somewhere,
-- and that is worth knowing about.
-- ---------------------------------------------------------------------------
SELECT
    status,
    rejection_reason,
    COUNT(*)                                          AS receipts,
    ROUND(AVG(input_tokens))                          AS avg_input_tokens,
    ROUND(AVG(output_tokens))                         AS avg_output_tokens,
    ROUND(AVG(
        input_tokens  * 0.10 / 1000000
      + output_tokens * 0.40 / 1000000
    )::numeric, 6)                                    AS avg_usd
FROM instapay_topup_request
WHERE model IS NOT NULL
GROUP BY status, rejection_reason
ORDER BY receipts DESC;


-- ---------------------------------------------------------------------------
-- 3 · Did a prompt change make the responses longer
--
-- Output length is where the money goes. Run this after touching the system
-- instruction or the schema: a step change in avg_output_tokens on the day
-- of the change is the thing to look for, and it will not show up in a
-- single total.
-- ---------------------------------------------------------------------------
SELECT
    DATE(created_at)                                  AS day,
    model,
    COUNT(*)                                          AS receipts,
    ROUND(AVG(input_tokens))                          AS avg_input_tokens,
    ROUND(AVG(output_tokens))                         AS avg_output_tokens
FROM instapay_topup_request
WHERE model IS NOT NULL
GROUP BY DATE(created_at), model
ORDER BY day DESC;


-- ---------------------------------------------------------------------------
-- 4 · Is the 30-second promise being kept
--
-- ORB-013 tells the user a request is normally resolved within about thirty
-- seconds. This is the evidence for that claim, measured end to end from
-- upload to resolution rather than just the model call — the queue wait is
-- part of what the user experiences.
-- ---------------------------------------------------------------------------
SELECT
    COUNT(*)                                          AS resolved,
    ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))))  AS avg_seconds,
    ROUND(MAX(EXTRACT(EPOCH FROM (resolved_at - created_at))))  AS worst_seconds,
    COUNT(*) FILTER (
        WHERE resolved_at - created_at > INTERVAL '30 seconds'
    )                                                 AS over_thirty_seconds,
    ROUND(AVG(call_duration_ms))                      AS avg_model_call_ms
FROM instapay_topup_request
WHERE resolved_at IS NOT NULL;


-- ---------------------------------------------------------------------------
-- 5 · Why receipts are being rejected
--
-- Mostly a product question rather than a cost one. A large
-- REFERENCE_NOT_VISIBLE share means the upload screen's callout is not
-- landing; a large WRONG_RECIPIENT share means people are mistyping the
-- number, which is a copy-button problem and not a model problem.
-- ---------------------------------------------------------------------------
SELECT
    rejection_reason,
    COUNT(*)                                          AS receipts,
    ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0), 1) AS pct
FROM instapay_topup_request
WHERE status = 'REJECTED'
GROUP BY rejection_reason
ORDER BY receipts DESC;


-- ---------------------------------------------------------------------------
-- 6 · Anything stuck
--
-- A PROCESSING row older than a few minutes means a process died holding
-- it; the job returns those to the queue at startup. FAILED rows exhausted
-- their retries without ever getting an answer, and the user's way forward
-- is a new upload — so a rising count here is an outage, not a backlog.
-- ---------------------------------------------------------------------------
SELECT
    status,
    COUNT(*)                                          AS receipts,
    MIN(created_at)                                   AS oldest,
    MAX(attempt_count)                                AS worst_attempt_count
FROM instapay_topup_request
WHERE status IN ('PENDING', 'PROCESSING', 'FAILED')
GROUP BY status
ORDER BY status;
