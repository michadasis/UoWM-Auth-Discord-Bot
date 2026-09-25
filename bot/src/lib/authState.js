const pool = require("./database");
const { hashStateToken, newStateToken } = require("./stateToken");

const LINK_TTL_MS = 10 * 60 * 1000;

// Creates a single-use login link bound to this Discord user, valid for 10 minutes.
// Any earlier unused link of the same user stops working.
async function createLoginLink(discordUserId, now = Date.now()) {
    const token = newStateToken();
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query("DELETE FROM auth_states WHERE discord_user_id = ? AND used_at IS NULL", [discordUserId]);
        await conn.query(
            "INSERT INTO auth_states (state_hash, discord_user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            [hashStateToken(token), discordUserId, now, now + LINK_TTL_MS],
        );
        await conn.commit();
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
    const base = process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
    return { url: `${base}/login?s=${token}`, expiresAt: now + LINK_TTL_MS };
}

// Removes expired and used states; they are only needed for the duration of a login.
async function purgeOldStates(now = Date.now()) {
    const result = await pool.query("DELETE FROM auth_states WHERE expires_at < ?", [now - 60 * 60 * 1000]);
    await pool.query("DELETE FROM email_send_log WHERE sent_at < ?", [now - 24 * 60 * 60 * 1000]);
    return result.affectedRows;
}

module.exports = { createLoginLink, purgeOldStates, LINK_TTL_MS };
