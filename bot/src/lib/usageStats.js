// Usage counters for the admin panel: clicks on role buttons, automatic replies sent, and messages
// per hour. Counts only, per day; no content and no member is stored.

const { dayKey } = require("./messageStats");

const TIME_ZONE = "Europe/Athens";
let ready = null;

function ensureUsageSchema(pool) {
    ready ??= (async () => {
        await pool.query(`CREATE TABLE IF NOT EXISTS role_menu_clicks (
            day DATE NOT NULL, menu_id INT NOT NULL, role_id VARCHAR(20) NOT NULL,
            adds INT NOT NULL DEFAULT 0, removes INT NOT NULL DEFAULT 0,
            PRIMARY KEY (day, menu_id, role_id)
        )`);
        await pool.query(`CREATE TABLE IF NOT EXISTS auto_reply_hits (
            day DATE NOT NULL, rule_id INT NOT NULL, hits INT NOT NULL DEFAULT 0,
            PRIMARY KEY (day, rule_id)
        )`);
        await pool.query(`CREATE TABLE IF NOT EXISTS message_hours (
            day DATE NOT NULL, hour TINYINT NOT NULL, count INT NOT NULL DEFAULT 0,
            PRIMARY KEY (day, hour)
        )`);
    })().catch((err) => { ready = null; throw err; });
    return ready;
}

// Hour of the day in Greece, 0-23.
function athensHour(date) {
    return Number(new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).format(date));
}

async function recordClick(pool, menuId, roleId, added, now = new Date()) {
    await ensureUsageSchema(pool);
    await pool.query(
        `INSERT INTO role_menu_clicks (day, menu_id, role_id, adds, removes) VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE adds = adds + VALUES(adds), removes = removes + VALUES(removes)`,
        [dayKey(now), menuId, roleId, added ? 1 : 0, added ? 0 : 1],
    );
}

async function recordHit(pool, ruleId, now = new Date()) {
    await ensureUsageSchema(pool);
    await pool.query("INSERT INTO auto_reply_hits (day, rule_id, hits) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE hits = hits + 1", [dayKey(now), ruleId]);
}

async function recordHour(pool, date) {
    await ensureUsageSchema(pool);
    await pool.query("INSERT INTO message_hours (day, hour, count) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE count = count + 1", [dayKey(date), athensHour(date)]);
}

const sinceDay = (days, now = Date.now()) => dayKey(new Date(now - (days - 1) * 86400000));

// roleId -> { adds, removes } over the last `days` days.
async function clickTotals(pool, menuId, days = 30) {
    await ensureUsageSchema(pool);
    const rows = await pool.query("SELECT role_id, SUM(adds) AS a, SUM(removes) AS r FROM role_menu_clicks WHERE menu_id = ? AND day >= ? GROUP BY role_id", [menuId, sinceDay(days)]);
    return new Map(rows.map((r) => [r.role_id, { adds: Number(r.a), removes: Number(r.r) }]));
}

// ruleId -> replies sent over the last `days` days.
async function hitTotals(pool, days = 30) {
    await ensureUsageSchema(pool);
    const rows = await pool.query("SELECT rule_id, SUM(hits) AS n FROM auto_reply_hits WHERE day >= ? GROUP BY rule_id", [sinceDay(days)]);
    return new Map(rows.map((r) => [Number(r.rule_id), Number(r.n)]));
}

// Messages by weekday (0 = Monday) and hour, between two days. Also the first day with data.
async function hourGrid(pool, start, end) {
    await ensureUsageSchema(pool);
    const rows = await pool.query("SELECT DATE_FORMAT(day, '%Y-%m-%d') AS d, hour, count FROM message_hours WHERE day BETWEEN ? AND ? ORDER BY day", [start, end]);
    const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
    for (const r of rows) {
        const weekday = (new Date(`${r.d}T12:00:00Z`).getUTCDay() + 6) % 7;
        grid[weekday][Number(r.hour)] += Number(r.count);
    }
    return { grid, first: rows[0]?.d ?? null };
}

// Verifications per month (1-12) in a year, for members still verified.
async function verificationsByMonth(pool, year) {
    const rows = await pool.query("SELECT MONTH(verified_at) AS m, COUNT(*) AS n FROM users WHERE YEAR(verified_at) = ? GROUP BY m", [year]);
    const months = new Array(12).fill(0);
    for (const r of rows) if (r.m) months[Number(r.m) - 1] = Number(r.n);
    return months;
}

module.exports = { ensureUsageSchema, athensHour, recordClick, recordHit, recordHour, clickTotals, hitTotals, hourGrid, verificationsByMonth };
