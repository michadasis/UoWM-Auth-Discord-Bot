// MariaDB data access for verification. Schema: db/setup.sql.
// test/helpers/memoryRepository.js implements the same interface for tests.

function mapChallenge(row) {
    return row
        ? {
            discordUserId: row.discord_user_id,
            uniIdHash: row.uni_id_hash,
            affiliation: row.affiliation,
            codeHash: row.code_hash,
            attempts: Number(row.attempts),
            sentAt: Number(row.sent_at),
            expiresAt: Number(row.expires_at),
        }
        : null;
}

function mapUser(row) {
    return row
        ? { discordUserId: row.discord_user_id, uniIdHash: row.uni_id_hash, affiliation: row.affiliation, verifiedAt: row.verified_at }
        : null;
}

function createRepository(pool) {
    return {
        async getChallenge(discordUserId) {
            const rows = await pool.query('SELECT * FROM email_challenges WHERE discord_user_id = ?', [discordUserId]);
            return mapChallenge(rows[0]);
        },

        async saveChallenge({ discordUserId, uniIdHash, affiliation, codeHash, attempts, sentAt, expiresAt }) {
            await pool.query(
                `INSERT INTO email_challenges (discord_user_id, uni_id_hash, affiliation, code_hash, attempts, sent_at, expires_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE uni_id_hash = VALUES(uni_id_hash), affiliation = VALUES(affiliation),
                    code_hash = VALUES(code_hash), attempts = VALUES(attempts), sent_at = VALUES(sent_at), expires_at = VALUES(expires_at)`,
                [discordUserId, uniIdHash, affiliation, codeHash, attempts, sentAt, expiresAt],
            );
        },

        // Returns the attempt count after incrementing.
        async incrementAttempts(discordUserId) {
            await pool.query('UPDATE email_challenges SET attempts = attempts + 1 WHERE discord_user_id = ?', [discordUserId]);
            const rows = await pool.query('SELECT attempts FROM email_challenges WHERE discord_user_id = ?', [discordUserId]);
            return Number(rows[0]?.attempts ?? 0);
        },

        // With codeHash: atomic single-use claim, only one caller gets true for a given code.
        async deleteChallenge(discordUserId, codeHash) {
            const result = codeHash
                ? await pool.query('DELETE FROM email_challenges WHERE discord_user_id = ? AND code_hash = ?', [discordUserId, codeHash])
                : await pool.query('DELETE FROM email_challenges WHERE discord_user_id = ?', [discordUserId]);
            return result.affectedRows === 1;
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

module.exports = { createRepository };
