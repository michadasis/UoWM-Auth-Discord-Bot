-- Verified members. This is the only lasting personal data the bot keeps.
-- uni_id_hash is HMAC-SHA256(UNI_ID_HASH_SECRET, "uowm-email\n" + identity), where identity is
-- "student:<student number>" or "faculty:<username>". Never the plain address or number.
-- The UNIQUE key enforces "one university account -> at most one Discord account".
CREATE TABLE IF NOT EXISTS users (
    discord_user_id VARCHAR(20) NOT NULL,
    uni_id_hash CHAR(64) NOT NULL,
    affiliation ENUM('student', 'faculty', 'staff') NOT NULL,
    verified_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (discord_user_id),
    UNIQUE KEY uq_users_uni_id_hash (uni_id_hash)
);

-- Pending email codes, at most one per Discord user, valid for 10 minutes.
-- code_hash is HMAC(UNI_ID_HASH_SECRET, discord user + identity hash + code); the code itself
-- and the email address are never stored. Rows are deleted on success and purged after expiry.
-- Times are epoch milliseconds.
CREATE TABLE IF NOT EXISTS email_challenges (
    discord_user_id VARCHAR(20) NOT NULL,
    uni_id_hash CHAR(64) NOT NULL,
    affiliation ENUM('student', 'faculty', 'staff') NOT NULL,
    code_hash CHAR(64) NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    sent_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL,
    PRIMARY KEY (discord_user_id),
    KEY idx_email_challenges_expires_at (expires_at)
);

-- Code emails sent recently, for rate limiting per Discord user and per mailbox.
-- target_hash is the same keyed hash as users.uni_id_hash. Purged after 24 hours.
CREATE TABLE IF NOT EXISTS email_send_log (
    id BIGINT NOT NULL AUTO_INCREMENT,
    discord_user_id VARCHAR(20) NOT NULL,
    target_hash CHAR(64) NOT NULL,
    sent_at BIGINT NOT NULL,
    PRIMARY KEY (id),
    KEY idx_email_send_log_user (discord_user_id, sent_at),
    KEY idx_email_send_log_target (target_hash, sent_at)
);

-- Manually granted guest role (e.g. first-year students without an institutional account yet).
CREATE TABLE IF NOT EXISTS guests (
    discord_id VARCHAR(20) NOT NULL,
    reason TEXT,
    given_by VARCHAR(20),
    msg_id VARCHAR(20),
    PRIMARY KEY (discord_id)
);
