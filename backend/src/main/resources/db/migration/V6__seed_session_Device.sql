-- Dev/local seed data only. Do NOT place this under classpath:db/migration --
-- Flyway would then apply it to every environment, including production,
-- and it would never be removable without a down-migration. Run this by
-- hand (psql, DBeaver, etc.) against your local/dev database only.
--
-- Adds 3 more session rows for the existing user
-- 5dbf81fc-4fe9-49ca-a82a-1125c83e9bff, on top of the 1 already there
-- (so 4 total afterward) -- useful for exercising the sessions list screen
-- (ORB-004) without actually signing in from 3 real devices.
--
-- refresh_token_hash values below are real, freshly-generated 32-byte
-- random hex (64 chars), matching what RefreshTokenGenerator.hash()
-- actually produces (SHA-256 hex) -- not placeholder-looking strings, so
-- the unique constraint and the column length both hold for real.
--
-- ip_address values use the RFC 5737 documentation ranges
-- (203.0.113.0/24, 198.51.100.0/24, 192.0.2.0/24) deliberately, so nothing
-- here looks like or resolves to a real address.

INSERT INTO session (
    id, user_id,
    refresh_token_hash, previous_refresh_token_hash,
    remember_me, device_label, user_agent, ip_address,
    last_used_at, idle_expires_at, absolute_expires_at,
    revoked_at, revoked_reason
) VALUES

-- Session 2: desktop Chrome on Windows, remember_me off, used a couple
-- hours ago -- ordinary, comfortably active session.
(
    gen_random_uuid(),
    '11111111-1111-1111-1111-111111111111',
    '2b0cf9ea23865353c8ccdcc10bcb515ddc6bbcf7be875d0c25451833510073bd',
    NULL,
    false,
    'Chrome on Windows',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    '203.0.113.10',
    NOW() - INTERVAL '2 hours',
    NOW() + INTERVAL '10 hours',
    NOW() + INTERVAL '22 hours',
    NULL, NULL
),

-- Session 3: iPhone Safari, remember_me on, last used a few days ago --
-- exercises the 7-day idle / 30-day absolute pair from the sign-in story.
(
    gen_random_uuid(),
    '22222222-2222-2222-2222-222222222222',
    '29bb7d45989d2212c7fc9c62ba0e4ddc6702c0fce3a1347924227542728cad42',
    NULL,
    true,
    'Safari on iOS',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    '198.51.100.23',
    NOW() - INTERVAL '3 days',
    NOW() + INTERVAL '4 days',
    NOW() + INTERVAL '27 days',
    NULL, NULL
),

-- Session 4: Android Chrome, remember_me off, deliberately close to its
-- idle cutoff -- useful for manually testing the "drops off the list once
-- expired" behaviour without waiting 12 real hours.
(
    gen_random_uuid(),
    '33333333-3333-3333-3333-333333333333',
    '75d799ff9e57413146022860c2e5d4eabf4045afbe2e2432318b149e6a6837d7',
    NULL,
    false,
    'Chrome on Android',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    '192.0.2.77',
    NOW() - INTERVAL '11 hours 30 minutes',
    NOW() + INTERVAL '30 minutes',
    NOW() + INTERVAL '12 hours 30 minutes',
    NULL, NULL
);