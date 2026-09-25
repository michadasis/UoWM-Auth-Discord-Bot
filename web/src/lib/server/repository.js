// MariaDB data access. Schema: db/setup.sql.
// tests/helpers/memoryRepository.js implements the same interface for tests.

import mariadb from 'mariadb';

export function createPool(db) {
    return mariadb.createPool({
        host: db.host,
        user: db.user,
        password: db.password,
        database: db.database,
        connectionLimit: 5,
        bigIntAsNumber: true,
        insertIdAsNumber: true,
    });
}

const toNumber = (value) => (value === null || value === undefined ? null : Number(value));

function mapState(row) {
    return row
        ? {
              discordUserId: row.discord_user_id,
              codeVerifier: row.code_verifier,
              nonce: row.nonce,
              expiresAt: Number(row.expires_at),
              usedAt: toNumber(row.used_at),
              emailUniIdHash: row.email_uni_id_hash,
              emailAffiliation: row.email_affiliation,
              emailCodeHash: row.email_code_hash,
              emailSentAt: toNumber(row.email_sent_at),
              emailAttempts: Number(row.email_attempts ?? 0),
          }
        : null;
}

function mapUser(row) {
    return row
        ? { discordUserId: row.discord_user_id, uniIdHash: row.uni_id_hash, affiliation: row.affiliation, verifiedAt: row.verified_at }
        : null;
}

export function createMariaRepository(pool) {
    return {
        async getState(stateHash) {
            const rows = await pool.query(
                `SELECT discord_user_id, code_verifier, nonce, expires_at, used_at,
                        email_uni_id_hash, email_affiliation, email_code_hash, email_sent_at, email_attempts
                 FROM auth_states WHERE state_hash = ?`,
                [stateHash],
            );
            return mapState(rows[0]);
        },

        // Stores PKCE verifier and nonce once; returns false if they were already set.
        async setStateChecks(stateHash, codeVerifier, nonce) {
            const result = await pool.query(
                'UPDATE auth_states SET code_verifier = ?, nonce = ? WHERE state_hash = ? AND code_verifier IS NULL AND used_at IS NULL',
                [codeVerifier, nonce, stateHash],
            );
            return result.affectedRows === 1;
        },

        // Atomically marks a state as used. Only one caller can ever get true.
        async claimState(stateHash, now) {
            const result = await pool.query(
                'UPDATE auth_states SET used_at = ? WHERE state_hash = ? AND used_at IS NULL AND expires_at > ?',
                [now, stateHash, now],
            );
            return result.affectedRows === 1;
        },

        // Email code flow: replaces the pending challenge. Attempts are cumulative per link.
        async setEmailChallenge(stateHash, { uniIdHash, affiliation, codeHash, sentAt }) {
            await pool.query(
                `UPDATE auth_states SET email_uni_id_hash = ?, email_affiliation = ?, email_code_hash = ?, email_sent_at = ?
                 WHERE state_hash = ? AND used_at IS NULL`,
                [uniIdHash, affiliation, codeHash, sentAt, stateHash],
            );
        },

        // Returns the attempt count after incrementing.
        async incrementEmailAttempts(stateHash) {
            await pool.query('UPDATE auth_states SET email_attempts = email_attempts + 1 WHERE state_hash = ?', [stateHash]);
            const rows = await pool.query('SELECT email_attempts FROM auth_states WHERE state_hash = ?', [stateHash]);
            return Number(rows[0]?.email_attempts ?? 0);
        },

        async countEmailSends({ discordUserId, targetHash, since }) {
            const rows = await pool.query(
                `SELECT
                    (SELECT COUNT(*) FROM email_send_log WHERE discord_user_id = ? AND sent_at > ?) AS by_user,
                    (SELECT COUNT(*) FROM email_send_log WHERE target_hash = ? AND sent_at > ?) AS by_target`,
                [discordUserId, since, targetHash, since],
            );
            return { byUser: Number(rows[0].by_user), byTarget: Number(rows[0].by_target) };
        },

        async logEmailSend({ discordUserId, targetHash, sentAt }) {
            await pool.query('INSERT INTO email_send_log (discord_user_id, target_hash, sent_at) VALUES (?, ?, ?)', [
                discordUserId,
                targetHash,
                sentAt,
            ]);
        },

        async findUserByDiscordId(discordUserId) {
            const rows = await pool.query('SELECT * FROM users WHERE discord_user_id = ?', [discordUserId]);
            return mapUser(rows[0]);
        },

        async findUserByUniHash(uniIdHash) {
            const rows = await pool.query('SELECT * FROM users WHERE uni_id_hash = ?', [uniIdHash]);
            return mapUser(rows[0]);
        },

        // Returns 'inserted' or 'duplicate' (either key already taken).
        async insertUser({ discordUserId, uniIdHash, affiliation }) {
            try {
                await pool.query('INSERT INTO users (discord_user_id, uni_id_hash, affiliation) VALUES (?, ?, ?)', [
                    discordUserId,
                    uniIdHash,
                    affiliation,
                ]);
                return 'inserted';
            } catch (err) {
                if (err.code === 'ER_DUP_ENTRY') return 'duplicate';
                throw err;
            }
        },

        async deleteUser(discordUserId) {
            await pool.query('DELETE FROM users WHERE discord_user_id = ?', [discordUserId]);
        },

        async getGuest(discordUserId) {
            const rows = await pool.query('SELECT discord_id, msg_id FROM guests WHERE discord_id = ?', [discordUserId]);
            return rows[0] ? { discordUserId: rows[0].discord_id, msgId: rows[0].msg_id } : null;
        },

        async deleteGuest(discordUserId) {
            await pool.query('DELETE FROM guests WHERE discord_id = ?', [discordUserId]);
        },
    };
}
