-- Verified members. This is the only personal data the service keeps.
-- uni_id_hash is HMAC-SHA256(UNI_ID_HASH_SECRET, issuer + "\n" + sub), never the plain identifier.
-- The UNIQUE key enforces "one university account -> at most one Discord account".
CREATE TABLE IF NOT EXISTS users (
    discord_user_id VARCHAR(20) NOT NULL,
    uni_id_hash CHAR(64) NOT NULL,
    affiliation ENUM('student', 'faculty', 'staff') NOT NULL,
    verified_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (discord_user_id),
    UNIQUE KEY uq_users_uni_id_hash (uni_id_hash)
);

-- Pending /auth links. Short-lived, purged by the bot shortly after expiry.
-- state_hash is SHA-256 of the random token in the link, so a DB leak does not leak usable links.
-- Times are epoch milliseconds to avoid time zone ambiguity between containers.
CREATE TABLE IF NOT EXISTS auth_states (
    state_hash CHAR(64) NOT NULL,
    discord_user_id VARCHAR(20) NOT NULL,
    code_verifier VARCHAR(128) NULL,
    nonce VARCHAR(64) NULL,
    created_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL,
    used_at BIGINT NULL,
    PRIMARY KEY (state_hash),
    KEY idx_auth_states_discord_user_id (discord_user_id),
    KEY idx_auth_states_expires_at (expires_at)
);

-- Manually granted guest role (e.g. first-year students without an institutional account yet).
CREATE TABLE IF NOT EXISTS guests (
    discord_id VARCHAR(20) NOT NULL,
    reason TEXT,
    given_by VARCHAR(20),
    msg_id VARCHAR(20),
    PRIMARY KEY (discord_id)
);
