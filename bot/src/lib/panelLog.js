// History of changes made from the admin panel: who changed what and when. Unlike the settings
// and texts tables, which only keep the current value, every save and reset is kept here.

let schemaReady = null;

function ensurePanelLog(pool) {
    schemaReady ??= pool.query(`CREATE TABLE IF NOT EXISTS panel_log (
        id INT NOT NULL AUTO_INCREMENT,
        at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        user_id VARCHAR(20) NOT NULL,
        area VARCHAR(64) NOT NULL,
        summary VARCHAR(1000) NOT NULL,
        PRIMARY KEY (id),
        KEY at_idx (at)
    )`).catch((err) => { schemaReady = null; throw err; });
    return schemaReady;
}

async function addEntry(pool, userId, area, summary) {
    try {
        await ensurePanelLog(pool);
        await pool.query("INSERT INTO panel_log (user_id, area, summary) VALUES (?, ?, ?)", [userId, area, String(summary).slice(0, 1000)]);
    } catch (err) {
        console.error(`Panel log write failed: ${err.message}`);
    }
}

// Newest first: [{ at: Date, userId, area, summary }].
async function recentEntries(pool, limit = 8) {
    try {
        await ensurePanelLog(pool);
        const rows = await pool.query("SELECT at, user_id, area, summary FROM panel_log ORDER BY id DESC LIMIT ?", [limit]);
        return (rows || []).filter((r) => r && r.user_id && r.summary).map((r) => ({ at: new Date(r.at), userId: r.user_id, area: r.area, summary: r.summary }));
    } catch {
        return [];
    }
}

module.exports = { ensurePanelLog, addEntry, recentEntries };
