DELETE FROM verification_token;

DELETE FROM session;

DELETE FROM users;

ALTER TABLE verification_token
DROP CONSTRAINT fk_verification_token_user;

ALTER TABLE session
DROP CONSTRAINT fk_session_user;

ALTER TABLE users
DROP CONSTRAINT fk_users_parent;

ALTER TABLE users
ALTER COLUMN id DROP IDENTITY;

ALTER TABLE users
ALTER COLUMN id TYPE UUID
USING gen_random_uuid();

ALTER TABLE verification_token
ALTER COLUMN user_id TYPE UUID;


ALTER TABLE users
ALTER COLUMN parent_id TYPE UUID
USING NULL;

ALTER TABLE users
ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE verification_token
ALTER COLUMN user_id TYPE UUID
USING NULL;

ALTER TABLE session
ALTER COLUMN user_id TYPE UUID
USING NULL;

ALTER TABLE verification_token
ADD CONSTRAINT fk_verification_token_user
    FOREIGN KEY (user_id)
    REFERENCES users(id);

ALTER TABLE session
ADD CONSTRAINT fk_session_user
    FOREIGN KEY (user_id)
    REFERENCES users(id);

ALTER TABLE users
ADD CONSTRAINT fk_users_parent
    FOREIGN KEY (parent_id)
    REFERENCES users(id);