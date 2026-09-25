const pool = require("./database");

// Pending codes are only needed for 10 minutes, send records for rate limiting for an hour.
async function purgeExpired(now = Date.now()) {
    await pool.query("DELETE FROM email_challenges WHERE expires_at < ?", [now]);
    await pool.query("DELETE FROM email_send_log WHERE sent_at < ?", [now - 24 * 60 * 60 * 1000]);
}

module.exports = { purgeExpired };
