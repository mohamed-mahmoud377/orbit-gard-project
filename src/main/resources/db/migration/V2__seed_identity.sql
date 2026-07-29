-- ===========================================================
-- V2__seed_identity.sql
-- Identity & Authentication seed data
-- ===========================================================

BEGIN;

------------------------------------------------------------
-- USERS
------------------------------------------------------------

WITH users_seed AS (

    INSERT INTO users (
                       id,
                       account_type,
                       status,
                       first_name,
                       last_name,
                       username,
                       email,
                       pending_email,
                       phone_number,
                       password_hash,
                       parent_id,
                       promo_code_entered
        )
        VALUES

            (
                '11111111-1111-1111-1111-111111111111',
                'USER',
                'ACTIVE',
                'Omar',
                'Hassan',
                'omar.hassan',
                'omar.hassan@example.com',
                NULL,
                '+201012345678',
                '$2b$10$uA93cVbREkpxYxjHHPIdleR.B0k7HBi3rNGtODzw08KhfbAmW.E8.',
                NULL,
                'WELCOME50'
            ),

            (
                '22222222-2222-2222-2222-222222222222',
                'USER',
                'ACTIVE',
                'Sara',
                'Ibrahim',
                'sara.ibrahim',
                'sara.ibrahim@example.com',
                NULL,
                '+201112345678',
                '$2b$10$yIkJRyF1/pSGpbEGT2qCR.2rjbb3oc2ffwf7V44rVXKhOH.fUwqmS',
                NULL,
                NULL
            ),

            (
                '33333333-3333-3333-3333-333333333333',
                'USER',
                'PENDING_VERIFICATION',
                'Karim',
                'Adel',
                'karim.adel',
                'karim.adel@example.com',
                NULL,
                '+201212345678',
                '$2b$10$6qVJytaVEJOqFmjKJbfOWO1Ik4shrWZa7CQsqevwgEHXfNXTDHdSi',
                NULL,
                'SUMMER2026'
            )

        RETURNING id

)

SELECT COUNT(*) FROM users_seed;

------------------------------------------------------------
-- VERIFICATION TOKENS
------------------------------------------------------------

INSERT INTO verification_token (

    id,
    user_id,
    token_hash,
    purpose,
    target_email,
    expires_at,
    consumed_at

)

VALUES

    (
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '33333333-3333-3333-3333-333333333333',
        'dbcb1d2571202f1dec193b202006113e201dc0caf6bbe4a8cba83d889c047ae8',
        'EMAIL_VERIFICATION',
        'karim.adel@example.com',
        NOW() + INTERVAL '12 hours',
        NULL
    ),

    (
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        '11111111-1111-1111-1111-111111111111',
        '7158ead33e14aabd8423e8a0c58efd5e2aa4dd6b3e742bb6fb4041deac905e8b',
        'EMAIL_VERIFICATION',
        'omar.hassan@example.com',
        NOW() - INTERVAL '1 day',
        NOW() - INTERVAL '23 hours'
    ),

    (
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        '22222222-2222-2222-2222-222222222222',
        'a6936c7ffc5be1734d39a97e74189ce7fe40239f5aae8becd22b44dd7f87383f',
        'PASSWORD_RESET',
        'sara.ibrahim@example.com',
        NOW() + INTERVAL '1 hour',
        NULL
    );

------------------------------------------------------------
-- SESSIONS
------------------------------------------------------------

INSERT INTO session (

    id,
    user_id,
    refresh_token_hash,
    previous_refresh_token_hash,
    remember_me,
    device_label,
    user_agent,
    ip_address,
    idle_expires_at,
    absolute_expires_at,
    revoked_at,
    revoked_reason

)

VALUES

    (

        'dddddddd-dddd-dddd-dddd-dddddddddddd',
        '11111111-1111-1111-1111-111111111111',
        'd8381f65034b0f723b21807167446b30981dc5c886ef3c90dc635585be5cc531',
        '1df92a5ac9590a7915b25ac9983110f558a34680536abd48986c68b0e58e7a98',
        false,
        'Chrome on Windows',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/138',
        '197.48.20.11',
        NOW() + INTERVAL '12 hours',
        NOW() + INTERVAL '24 hours',
        NULL,
        NULL

    ),

    (

        'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        '22222222-2222-2222-2222-222222222222',
        'b92b686eb6d99a62cad2325b7a3ab98c358cdb7bc18587602544baf164009006',
        NULL,
        true,
        'Chrome on macOS',
        'Mozilla/5.0 (Macintosh) Chrome/138',
        '197.48.20.12',
        NOW() + INTERVAL '7 days',
        NOW() + INTERVAL '30 days',
        NULL,
        NULL

    ),

    (

        'ffffffff-ffff-ffff-ffff-ffffffffffff',
        '11111111-1111-1111-1111-111111111111',
        '3e2ef4b7a9d528918bbfbe9b5b1d3969090b1ccbd45de3d1f405187c9516f518',
        NULL,
        false,
        'Firefox on Linux',
        'Mozilla/5.0 (X11; Ubuntu)',
        '197.48.20.13',
        NOW() - INTERVAL '1 day',
        NOW() - INTERVAL '1 hour',
        NOW() - INTERVAL '1 hour',
        'TOKEN_REUSE'

    );

COMMIT;