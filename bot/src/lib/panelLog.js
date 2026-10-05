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

// Filtered and paged: { area, userId, q } -> { entries, total, page, pages, areas, userIds }.
async function queryEntries(pool, { area = "", userId = "", q = "", page = 1, pageSize = 50 } = {}) {
    const empty = { entries: [], total: 0, page: 1, pages: 1, areas: [], userIds: [] };
    try {
        await ensurePanelLog(pool);
        const where = [];
        const params = [];
        if (area) { where.push("area = ?"); params.push(area); }
        if (userId) { where.push("user_id = ?"); params.push(userId); }
        if (q) { where.push("summary LIKE ?"); params.push(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`); }
        const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
        const total = Number((await pool.query(`SELECT COUNT(*) AS n FROM panel_log ${clause}`, params))[0]?.n ?? 0);
        const pages = Math.max(1, Math.ceil(total / pageSize));
        const current = Math.min(Math.max(1, Number(page) || 1), pages);
        const rows = await pool.query(`SELECT at, user_id, area, summary FROM panel_log ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, pageSize, (current - 1) * pageSize]);
        const areas = (await pool.query("SELECT DISTINCT area FROM panel_log ORDER BY area")).map((r) => r.area);
        const userIds = (await pool.query("SELECT DISTINCT user_id FROM panel_log")).map((r) => r.user_id);
        return {
            entries: (rows || []).filter((r) => r && r.user_id && r.summary).map((r) => ({ at: new Date(r.at), userId: r.user_id, area: r.area, summary: r.summary })),
            total, page: current, pages, areas, userIds,
        };
    } catch {
        return empty;
    }
}

module.exports = { ensurePanelLog, addEntry, recentEntries, queryEntries };
