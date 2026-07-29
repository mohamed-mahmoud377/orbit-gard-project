CREATE TABLE users (
    id UUID PRIMARY KEY,

    account_type VARCHAR(10) NOT NULL,
    status VARCHAR(24) NOT NULL,

    first_name VARCHAR(30) NOT NULL,
    last_name VARCHAR(30) NOT NULL,

    username VARCHAR(30) NOT NULL,

    email VARCHAR(255),
    pending_email VARCHAR(255),

    phone_number VARCHAR(13),

    password_hash VARCHAR(72) NOT NULL,

    parent_id UUID,

    promo_code_entered VARCHAR(32),

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_users_username
        UNIQUE (username),

    CONSTRAINT uq_users_email
        UNIQUE (email),

    CONSTRAINT uq_users_phone_number
        UNIQUE (phone_number),

    CONSTRAINT fk_users_parent
        FOREIGN KEY (parent_id)
        REFERENCES users(id),

    CONSTRAINT chk_users_account_type
        CHECK (
            account_type IN ('USER', 'CHILD')
        ),

    CONSTRAINT chk_users_status
        CHECK (
            status IN (
                'PENDING_VERIFICATION',
                'ACTIVE',
                'SUSPENDED'
            )
        ),


        CONSTRAINT chk_users_username_format
            CHECK (
                username ~ '^[a-z0-9._-]{3,30}$'
            ),

    CONSTRAINT chk_users_first_name
        CHECK (
            first_name ~ '^[A-Za-z]+([ ''-][A-Za-z]+)*$'
        ),

    CONSTRAINT chk_users_last_name
        CHECK (
            last_name ~ '^[A-Za-z]+([ ''-][A-Za-z]+)*$'
        ),

    CONSTRAINT chk_users_phone_number
        CHECK (
            phone_number IS NULL
            OR phone_number ~ '^\+20(10|11|12|15)[0-9]{8}$'
        )
);

--Trigger function for account updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS
$$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
