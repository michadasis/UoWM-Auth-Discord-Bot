// Aggregate message statistics: how many messages were sent per day and channel.
// Only counts are stored, never who sent a message or what it said.
//
// Periods (semesters, exam sessions, breaks) are defined in a JSON file and applied when
// /stats runs, so correcting a date re-buckets the existing counts.

const fs = require("fs/promises");

const TIME_ZONE = "Europe/Athens";
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_DAY = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

async function ensureSchema(pool) {
    await pool.query(`CREATE TABLE IF NOT EXISTS message_counts (
        day DATE NOT NULL,
        channel_id VARCHAR(20) NOT NULL,
        count INT NOT NULL DEFAULT 0,
        PRIMARY KEY (day, channel_id)
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS bot_meta (
        meta_key VARCHAR(50) NOT NULL,
        meta_value VARCHAR(100) NOT NULL,
        PRIMARY KEY (meta_key)
    )`);
}

// Calendar day in Greek time, "YYYY-MM-DD".
function dayKey(date, timeZone = TIME_ZONE) {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

// Human messages in our server only: no bots, webhooks (e.g. the exam watcher) or system messages.
function shouldCount(message, guildId) {
    return message.guildId === guildId && !message.author?.bot && !message.webhookId && !message.system;
}

// Thread messages count towards their parent channel.
function statsChannelId(channel) {
    return channel.isThread?.() && channel.parentId ? channel.parentId : channel.id;
}

async function recordMessage(pool, day, channelId) {
    await pool.query(
        "INSERT INTO message_counts (day, channel_id, count) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE count = count + 1",
        [day, channelId],
    );
}

async function getMeta(pool, key) {
    const rows = await pool.query("SELECT meta_value FROM bot_meta WHERE meta_key = ?", [key]);
    return rows[0]?.meta_value ?? null;
}

async function setMeta(pool, key, value) {
    await pool.query(
        "INSERT INTO bot_meta (meta_key, meta_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE meta_value = VALUES(meta_value)",
        [key, String(value)],
    );
}

// When live counting began (epoch ms). Set once, on the first start with this feature.
async function countingStartedAt(pool, now = Date.now()) {
    const stored = await getMeta(pool, "counting_started_at");
    if (stored) return Number(stored);
    await pool.query("INSERT IGNORE INTO bot_meta (meta_key, meta_value) VALUES ('counting_started_at', ?)", [String(now)]);
    return Number(await getMeta(pool, "counting_started_at"));
}

// Periods file: a JSON array of entries, each with a "name" and one of:
//   "start"/"end" as "MM-DD": repeats every year; the academic year is added to the name.
//                             An end before the start runs into the next year (e.g. 12-24 to 01-06).
//   "start"/"end" as "YYYY-MM-DD": a single, dated period, name used as is.
//   "easter": { "from": -6, "to": 7 }: days relative to Orthodox Easter Sunday, every year.
// All ranges are inclusive.
function parsePeriods(text) {
    const data = JSON.parse(text);
    if (!Array.isArray(data)) throw new Error("periods file must contain a JSON array");
    return data.map((p, i) => {
        if (!p || typeof p.name !== "string" || !p.name.trim()) throw new Error(`period ${i + 1}: missing name`);
        const name = p.name.trim();
        if (p.easter !== undefined) {
            const { from, to } = p.easter || {};
            if (!Number.isInteger(from) || !Number.isInteger(to) || from > to) throw new Error(`period "${name}": easter needs integer from <= to`);
            return { kind: "easter", name, from, to };
        }
        if (DAY.test(p.start) && DAY.test(p.end)) {
            if (p.start > p.end) throw new Error(`period "${name}": start is after end`);
            return { kind: "dated", name, start: p.start, end: p.end };
        }
        if (MONTH_DAY.test(p.start) && MONTH_DAY.test(p.end)) return { kind: "yearly", name, start: p.start, end: p.end };
        throw new Error(`period "${name}": start and end must both be MM-DD or both YYYY-MM-DD, or use easter`);
    });
}

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

// Orthodox Easter Sunday (Gregorian date) for 1900-2099: Meeus' Julian algorithm plus 13 days.
function orthodoxEaster(year) {
    const a = year % 4, b = year % 7, c = year % 19;
    const d = (19 * c + 15) % 30;
    const e = (2 * a + 4 * b - d + 34) % 7;
    const month = Math.floor((d + e + 114) / 31);
    const day = ((d + e + 114) % 31) + 1;
    return addDays(new Date(Date.UTC(year, month - 1, day)), 13);
}

// Academic years run September to August: a period starting in September or later belongs to
// year-(year+1), anything earlier to (year-1)-year.
function academicYear(start) {
    const year = Number(start.slice(0, 4));
    return Number(start.slice(5, 7)) >= 9 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

// Concrete dated periods for the given calendar years, sorted by start.
function expandPeriods(entries, fromYear, toYear) {
    const out = [];
    for (const entry of entries) {
        if (entry.kind === "dated") {
            out.push({ name: entry.name, start: entry.start, end: entry.end });
            continue;
        }
        for (let year = fromYear; year <= toYear; year++) {
            let start;
            let end;
            if (entry.kind === "easter") {
                const easter = orthodoxEaster(year);
                start = ymd(addDays(easter, entry.from));
                end = ymd(addDays(easter, entry.to));
            } else {
                start = `${year}-${entry.start}`;
                end = `${entry.end < entry.start ? year + 1 : year}-${entry.end}`;
            }
            out.push({ name: `${entry.name} ${academicYear(start)}`, start, end });
        }
    }
    return out.sort((x, y) => x.start.localeCompare(y.start) || x.end.localeCompare(y.end));
}

// Parsed entries of the periods file, or [] when there is none. Expand with expandPeriods.
async function loadPeriodEntries(file) {
    let text;
    try {
        text = await fs.readFile(file, "utf8");
    } catch (err) {
        if (err.code === "ENOENT") return [];
        throw err;
    }
    return parsePeriods(text);
}

// A day inside several periods (e.g. Christmas inside the winter semester) belongs to the one
// that started last, the more specific one.
function periodFor(periods, day) {
    return periods.filter((p) => p.start <= day && day <= p.end).pop() || null;
}

// Messages per day between two days, [{ day: "YYYY-MM-DD", count }] in date order.
// With channelId, only that channel (threads are counted under their parent).
async function dailyTotals(pool, start, end, channelId = null) {
    const rows = await pool.query(
        `SELECT DATE_FORMAT(day, '%Y-%m-%d') AS d, SUM(count) AS n FROM message_counts
         WHERE day BETWEEN ? AND ?${channelId ? ' AND channel_id = ?' : ''} GROUP BY day ORDER BY day`,
        channelId ? [start, end, channelId] : [start, end],
    );
    return rows.map((r) => ({ day: r.d, count: Number(r.n) }));
}

// Sums daily totals per period, each day in exactly one period (the most specific one), so the
// parts add up to the total. Days outside every period go to outsideName. In order of first day.
function totalsByPeriod(days, periods, outsideName) {
    const groups = new Map();
    for (const { day, count } of days) {
        const period = periodFor(periods, day);
        const key = period ? `${period.name}|${period.start}` : outsideName;
        const group = groups.get(key) || { name: period ? period.name : outsideName, period, first: day, last: day, count: 0 };
        group.last = day;
        group.count += count;
        groups.set(key, group);
    }
    return [...groups.values()];
}

async function topChannels(pool, start, end, limit = 5) {
    const rows = await pool.query(
        `SELECT channel_id, SUM(count) AS n FROM message_counts WHERE day BETWEEN ? AND ?
         GROUP BY channel_id ORDER BY n DESC LIMIT ?`,
        [start, end, limit],
    );
    return rows.map((r) => ({ channelId: r.channel_id, count: Number(r.n) }));
}

function formatDay(day) {
    const [y, m, d] = day.split("-");
    return `${Number(d)}/${Number(m)}/${y}`;
}

module.exports = {
    TIME_ZONE,
    ensureSchema,
    dayKey,
    shouldCount,
    statsChannelId,
    recordMessage,
    getMeta,
    setMeta,
    countingStartedAt,
    parsePeriods,
    expandPeriods,
    orthodoxEaster,
    loadPeriodEntries,
    periodFor,
    dailyTotals,
    totalsByPeriod,
    topChannels,
    formatDay,
};
