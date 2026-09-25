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

function mapState(row) {
    return row
        ? {
              discordUserId: row.discord_user_id,
              codeVerifier: row.code_verifier,
              nonce: row.nonce,
              expiresAt: Number(row.expires_at),
              usedAt: row.used_at === null ? null : Number(row.used_at),
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
                'SELECT discord_user_id, code_verifier, nonce, expires_at, used_at FROM auth_states WHERE state_hash = ?',
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
