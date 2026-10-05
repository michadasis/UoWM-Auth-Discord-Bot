const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const path = require("path");

process.env.PERIODS_FILE = path.join(__dirname, "..", "..", "data", "periods.example.json");
const usage = require("../src/lib/usageStats");
const { createHandler } = require("../src/panel/server");
const session = require("../src/panel/session");

const MEMBER = "200000000000000001";
const ADMIN = "111111111111111111";
const db = {
    clicks: [], hits: [], hours: [],
    log: [
        { id: 3, at: new Date("2026-10-02T10:00:00Z"), user_id: ADMIN, area: "Αφαίρεση επαλήθευσης", summary: "Νίκος (Φοιτητής)" },
        { id: 2, at: new Date("2026-10-01T10:00:00Z"), user_id: ADMIN, area: "Ρυθμίσεις", summary: "Κατάσταση bot: α → β" },
        { id: 1, at: new Date("2026-09-30T10:00:00Z"), user_id: ADMIN, area: "Προσωρινές άδειες", summary: "Δόθηκε στον Νίκος (@nikos): Erasmus" },
    ],
};
const pool = { query: async (sql, p = []) => {
    if (sql.startsWith("CREATE TABLE")) return [];
    if (sql.startsWith("INSERT INTO role_menu_clicks")) { db.clicks.push(p); return []; }
    if (sql.startsWith("INSERT INTO auto_reply_hits")) { db.hits.push(p); return []; }
    if (sql.startsWith("INSERT INTO message_hours")) { db.hours.push(p); return []; }
    if (sql.startsWith("SELECT role_id, SUM(adds)")) return [{ role_id: "sem-a", a: 5, r: 2 }];
    if (sql.startsWith("SELECT rule_id, SUM(hits)")) return [{ rule_id: 1, n: 14 }];
    if (sql.startsWith("SELECT DATE_FORMAT(day, '%Y-%m-%d') AS d, hour, count FROM message_hours")) return [{ d: "2026-09-28", hour: 21, count: 40 }, { d: "2026-09-29", hour: 9, count: 5 }];
    if (sql.startsWith("SELECT MONTH(verified_at)")) return [{ m: 9, n: 30 }, { m: 10, n: 4 }];
    if (sql.includes("GROUP BY day")) return p[0].startsWith("2026") ? [{ d: "2026-06-10", n: 50 }, { d: "2026-09-28", n: 20 }] : [{ d: "2025-06-10", n: 25 }];
    if (sql.includes("GROUP BY channel_id")) return [];
    if (sql.startsWith("SELECT discord_user_id, affiliation, verified_at FROM users ORDER")) return [{ discord_user_id: MEMBER, affiliation: "student", verified_at: new Date("2026-09-28") }];
    if (sql.startsWith("SELECT affiliation, verified_at FROM users WHERE")) return p[0] === MEMBER ? [{ affiliation: "student", verified_at: new Date("2026-09-28") }] : [];
    if (sql.startsWith("SELECT reason, given_by FROM guests")) return [];
    if (sql.startsWith("SELECT COUNT(*) AS n FROM panel_log")) return [{ n: filterLog(sql, p).length }];
    if (sql.startsWith("SELECT at, user_id, area, summary FROM panel_log")) { const rows = filterLog(sql, p); if (!sql.includes("OFFSET")) return rows.slice(0, p[0]); const [limit, offset] = p.slice(-2); return rows.slice(offset, offset + limit); }
    if (sql.startsWith("SELECT DISTINCT area")) return [...new Set(db.log.map((e) => e.area))].map((area) => ({ area }));
    if (sql.startsWith("SELECT DISTINCT user_id")) return [{ user_id: ADMIN }];
    if (sql.includes("bot_meta")) return [{ meta_value: "1" }];
    return [];
} };
function filterLog(sql, p) {
    let i = 0;
    let rows = db.log;
    if (sql.includes("area = ?")) { const a = p[i++]; rows = rows.filter((e) => e.area === a); }
    if (sql.includes("user_id = ?")) { const u = p[i++]; rows = rows.filter((e) => e.user_id === u); }
    if (sql.includes("summary LIKE ?")) { const q = p[i++].slice(1, -1); rows = rows.filter((e) => e.summary.includes(q)); }
    return rows;
}

const roles = new Map([["g", { id: "g", name: "@everyone", position: 0 }], ["r-admin", { id: "r-admin", name: "Admin", position: 9 }], ["r-student", { id: "r-student", name: "Φοιτητής", position: 2 }]]);
const member = (id, name, roleIds) => ({ id, displayName: name, joinedAt: new Date("2026-09-20"), guild: { ownerId: "0" }, permissions: { has: () => false }, roles: { cache: new Map(roleIds.map((r) => [r, roles.get(r)])) }, user: { id, username: name.toLowerCase(), globalName: name, avatar: null } });
const members = new Map([[ADMIN, member(ADMIN, "Admin", ["r-admin"])], [MEMBER, member(MEMBER, "Νίκος", ["r-student"])]]);
const guild = {
    id: "g", ownerId: "0", memberCount: 2, createdAt: new Date("2025-05-15T10:00:00Z"),
    roles: { cache: roles, fetch: async () => roles }, channels: { cache: new Map(), fetch: async () => new Map() },
    members: { cache: members, fetch: async (arg) => { if (arg === undefined) return members; const m = members.get(typeof arg === "string" ? arg : arg.user); if (!m) throw new Error("Unknown Member"); return m; } },
};
const client = { guilds: { fetch: async () => guild } };
const config = { baseUrl: "https://panel.example.com", clientId: "1", clientSecret: "s", sessionSecret: "z".repeat(40), guildId: "g", adminRoleId: "r-admin" };
const cookie = `${session.SESSION_COOKIE}=${session.sign(config.sessionSecret, { uid: ADMIN, csrf: "tok", exp: Date.now() + 3600e3 })}`;

let server;
let base;
before(async () => {
    server = http.createServer(createHandler({ client, pool, config }));
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.closeAllConnections(); server.close(); });
const get = async (p) => (await fetch(base + p, { headers: { cookie } })).text();

test("usage counters record clicks, replies and hours (in Greek time)", async () => {
    await usage.recordClick(pool, 1, "sem-a", true, new Date("2026-10-05T10:00:00Z"));
    await usage.recordClick(pool, 1, "sem-a", false, new Date("2026-10-05T10:00:00Z"));
    await usage.recordHit(pool, 3, new Date("2026-10-05T10:00:00Z"));
    await usage.recordHour(pool, new Date("2026-10-05T21:30:00Z")); // 00:30 the next day in Greece
    assert.deepEqual(db.clicks, [["2026-10-05", 1, "sem-a", 1, 0], ["2026-10-05", 1, "sem-a", 0, 1]]);
    assert.deepEqual(db.hits, [["2026-10-05", 3]]);
    assert.deepEqual(db.hours, [["2026-10-06", 0]]);
    const { grid } = await usage.hourGrid(pool, "2026-01-01", "2026-12-31");
    assert.equal(grid[0][21], 40); // 28 Sep 2026 is a Monday
    assert.equal(grid[1][9], 5);
});

test("stats page: last year's periods, verifications per month, hour heatmap", async () => {
    const html = await get("/stats?year=2026");
    assert.match(html, /<th>Πέρσι<\/th>/);
    assert.match(html, /\+100%/); // June exams: 50 now, 25 last year
    assert.match(html, /Επαληθεύσεις ανά μήνα/);
    assert.match(html, /<title>Σεπ: 30<\/title>/);
    assert.match(html, /Δευτέρα 21:00: 40 μηνύματα/);
});

test("member page and members CSV", async () => {
    const html = await get(`/members/view?id=${MEMBER}`);
    assert.match(html, /<h1>Νίκος<\/h1>/);
    assert.match(html, /@Φοιτητής/);
    assert.match(html, /Αφαίρεση επαλήθευσης/);
    assert.match(html, /Δόθηκε στον Νίκος/); // history that mentions them
    assert.equal((await fetch(`${base}/members/view?id=999999999999999999`, { headers: { cookie } })).status, 404);
    const res = await fetch(`${base}/members.csv`, { headers: { cookie } });
    assert.match(res.headers.get("content-disposition"), /members\.csv/);
    const csv = Buffer.from(await res.arrayBuffer()).toString("utf8");
    assert.match(csv, new RegExp(`${MEMBER},Νίκος,νίκος,Φοιτητής,`));
    assert.match(await get("/members"), new RegExp(`href="/members/view\\?id=${MEMBER}"`));
});

test("history filters and counts", async () => {
    assert.match(await get("/history"), /3 αλλαγές/);
    const byArea = await get(`/history?area=${encodeURIComponent("Ρυθμίσεις")}`);
    assert.match(byArea, /1 αλλαγή με αυτά τα κριτήρια/);
    assert.match(byArea, /Κατάσταση bot/);
    const bySearch = await get(`/history?q=${encodeURIComponent("Erasmus")}`);
    assert.match(bySearch, /Δόθηκε στον Νίκος/);
    assert.doesNotMatch(bySearch, /Κατάσταση bot/);
});
