const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const path = require("path");

process.env.PERIODS_FILE = path.join(__dirname, "..", "..", "data", "periods.example.json");
const { createHandler } = require("../src/panel/server");
const session = require("../src/panel/session");
const texts = require("../src/lib/texts");

// Counts for two channels in 2026, one of them hidden from the panel user.
const rows = [];
for (let d = Date.UTC(2026, 4, 16); d <= Date.UTC(2026, 8, 1); d += 86400000) {
    const day = new Date(d).toISOString().slice(0, 10);
    rows.push({ day, channel: "c-general", n: 10 }, { day, channel: "c-hidden", n: 50 });
}
const pool = {
    query: async (sql, params = []) => {
        if (sql.startsWith("SELECT text_key") || sql.startsWith("CREATE TABLE")) return [];
        if (sql.includes("GROUP BY day")) {
            const [from, to, channel] = params;
            const byDay = new Map();
            for (const r of rows) if (r.day >= from && r.day <= to && (!channel || r.channel === channel)) byDay.set(r.day, (byDay.get(r.day) || 0) + r.n);
            return [...byDay].sort().map(([d, n]) => ({ d, n }));
        }
        if (sql.includes("GROUP BY channel_id")) {
            const totals = new Map();
            for (const r of rows) if (r.day >= params[0] && r.day <= params[1]) totals.set(r.channel, (totals.get(r.channel) || 0) + r.n);
            return [...totals].sort((a, b) => b[1] - a[1]).map(([channel_id, n]) => ({ channel_id, n }));
        }
        if (sql.includes("bot_meta")) return [{ meta_value: "1" }];
        return [];
    },
};
const ADMIN = "111111111111111111";
const member = { id: ADMIN, guild: { ownerId: "0" }, permissions: { has: () => false }, roles: { cache: new Set(["r-admin"]) }, user: { id: ADMIN, username: "a", globalName: "A", avatar: null, tag: "a" } };
const channel = (id, name, visible) => ({ id, name, type: 0, rawPosition: 1, parent: null, permissionsFor: () => ({ has: () => visible }) });
const channels = new Map([["c-general", channel("c-general", "general", true)], ["c-hidden", channel("c-hidden", "admin-only", false)]]);
const guild = { id: "g", ownerId: "0", createdAt: new Date("2026-05-15T10:00:00Z"), channels: { cache: channels, fetch: async (id) => (id ? channels.get(id) : channels) }, roles: { everyone: {} }, members: { fetch: async () => member } };
const client = { guilds: { fetch: async () => guild } };
const config = { baseUrl: "https://panel.example.com", clientId: "1", clientSecret: "s", sessionSecret: "z".repeat(40), guildId: "g", adminRoleId: "r-admin" };
const cookie = `${session.SESSION_COOKIE}=${session.sign(config.sessionSecret, { uid: ADMIN, csrf: "t", exp: Date.now() + 3600e3 })}`;

let server;
let base;
before(async () => {
    await texts.loadTexts(pool);
    server = http.createServer(createHandler({ client, pool, config }));
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());
const get = (p) => fetch(base + p, { headers: { cookie }, redirect: "manual" });

test("stats page: totals, periods, top channels without hidden ones, chart and CSV links", async () => {
    const html = await (await get("/stats?year=2026")).text();
    assert.match(html, /Μηνύματα/);
    assert.match(html, /Εξεταστική Ιουνίου/);
    assert.match(html, /#general/);
    assert.doesNotMatch(html, /admin-only/);
    assert.match(html, /\/stats\/chart\.png\?year=2026/);
    // The chart is inline SVG with the daily counts for the hover marker: -1 before counting began.
    assert.match(html, /<svg [^>]*class="activity-chart"/);
    const counts = html.match(/data-counts="([^"]+)"/)[1].split(",").map(Number);
    assert.equal(counts.length, 365);
    assert.equal(counts[0], -1);
    assert.equal(counts[135], 60); // 16 May: 10 + 50 from both channels
    assert.match(html, /<g class="cursor"/);
    assert.match(html, /\/stats\/activity\.csv\?year=2026/);
});

test("stats page: hidden channels and impossible years are refused", async () => {
    assert.match(await (await get("/stats?year=2026&channel=c-hidden")).text(), /δεν έχετε πρόσβαση/);
    assert.match(await (await get("/stats?year=2025")).text(), /Διαθέσιμα έτη: 2026/);
    assert.match(await (await get("/stats?year=abc")).text(), /Διαθέσιμα έτη/);
    assert.equal((await get("/stats/activity.csv?year=2026&channel=c-hidden")).status, 400);
    assert.equal((await get("/stats/chart.png?year=2026&channel=c-hidden")).status, 400);
});

test("one channel: its own numbers only", async () => {
    const res = await get("/stats/activity.csv?year=2026&channel=c-general");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-disposition"), /activity-2026-general\.csv/);
    const bytes = Buffer.from(await res.arrayBuffer());
    assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]); // UTF-8 BOM for Excel
    const csv = bytes.toString("utf8");
    assert.match(csv, /Ημερομηνία,Περίοδος,Μηνύματα/);
    assert.match(csv, /2026-05-16,[^,]+,10\r\n/);
});

test("the chart is a PNG", async () => {
    const res = await get("/stats/chart.png?year=2026");
    assert.equal(res.headers.get("content-type"), "image/png");
    assert.equal(Buffer.from(await res.arrayBuffer()).subarray(1, 4).toString(), "PNG");
});

test("stats pages need a login", async () => {
    for (const p of ["/stats", "/stats/chart.png", "/stats/activity.csv"]) {
        const res = await fetch(base + p, { redirect: "manual" });
        assert.equal(res.status, 303, p);
    }
});
