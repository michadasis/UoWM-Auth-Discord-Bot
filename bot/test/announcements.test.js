const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const ann = require("../src/lib/announcements");

test("Greek time to UTC and back, summer and winter", () => {
    assert.equal(ann.athensLocalToDate("2026-10-10T18:00").toISOString(), "2026-10-10T15:00:00.000Z");
    assert.equal(ann.athensLocalToDate("2026-12-10T18:00").toISOString(), "2026-12-10T16:00:00.000Z");
    assert.equal(ann.dateToAthensLocal(new Date("2026-12-10T16:00:00Z")), "2026-12-10T18:00");
    assert.equal(ann.athensLocalToDate("not a date"), null);
});

test("pings go in the message text and only where chosen", () => {
    assert.deepEqual(ann.buildMessage({ title: "T", ping: "" }).allowedMentions, { parse: [] });
    const everyone = ann.buildMessage({ title: "T", ping: "everyone" });
    assert.equal(everyone.content, "@everyone");
    assert.deepEqual(everyone.allowedMentions, { parse: ["everyone"] });
    const role = ann.buildMessage({ title: "T", ping: "123456789012345678" });
    assert.equal(role.content, "<@&123456789012345678>");
    assert.deepEqual(role.allowedMentions, { roles: ["123456789012345678"] });
});

// In-memory announcements table.
const rows = [];
const pool = { query: async (sql, p = []) => {
    if (sql.startsWith("CREATE TABLE")) return [];
    if (sql.startsWith("SELECT * FROM announcements WHERE sent_at IS NULL")) return rows.filter((r) => !r.sent_at && r.send_at && r.send_at <= p[0]).map((r) => ({ ...r }));
    if (sql.startsWith("SELECT * FROM announcements WHERE id")) return rows.filter((r) => r.id === Number(p[0])).map((r) => ({ ...r }));
    if (sql.startsWith("SELECT * FROM announcements ORDER")) return [...rows].reverse().map((r) => ({ ...r }));
    const cols = ["channel_id", "message_id", "title", "description", "color", "footer", "image_url", "ping", "send_at", "sent_at", "last_error"];
    if (sql.startsWith("INSERT INTO announcements")) { const r = { id: rows.length + 1 }; cols.forEach((c, i) => { r[c] = p[i]; }); rows.push(r); return { insertId: r.id }; }
    if (sql.startsWith("UPDATE announcements")) { const r = rows.find((x) => x.id === p[11]); cols.forEach((c, i) => { r[c] = p[i]; }); return []; }
    if (sql.startsWith("DELETE FROM announcements")) { rows.splice(rows.findIndex((r) => r.id === p[0]), 1); return []; }
    return [];
} };
const sent = [];
const edited = [];
const channel = { id: "c-ann", name: "ανακοινώσεις", type: 0, rawPosition: 1, parent: null, permissionsFor: () => ({ has: () => true }),
    send: async (m) => { sent.push(m); return { id: `m${sent.length}` }; },
    messages: { fetch: async (id) => ({ edit: async (m) => edited.push([id, m]), delete: async () => {} }) } };
const fakeClient = { channels: { fetch: async () => channel } };

test("scheduled announcements are sent when due, failures are kept", async () => {
    const id = await ann.saveAnnouncement(pool, { channelId: "c-ann", title: "Εξεταστική", description: "", color: "#F4A11C", footer: "", imageUrl: "", ping: "", sendAt: new Date("2026-10-10T15:00:00Z") }, "u");
    assert.equal(await ann.sendDue(fakeClient, pool, new Date("2026-10-10T14:59:00Z")), 0);
    assert.equal(await ann.sendDue(fakeClient, pool, new Date("2026-10-10T15:00:30Z")), 1);
    assert.equal(sent.length, 1);
    const a = await ann.getAnnouncement(pool, id);
    assert.equal(a.messageId, "m1");
    assert.ok(a.sentAt);
    assert.equal(await ann.sendDue(fakeClient, pool, new Date("2026-10-11T00:00:00Z")), 0); // not twice
    // Editing a sent one edits the message and pings no one.
    await ann.sendAnnouncement(fakeClient, pool, { ...a, ping: "everyone", title: "Διόρθωση" });
    assert.equal(edited[0][0], "m1");
    assert.equal(edited[0][1].content, undefined);
    assert.deepEqual(edited[0][1].allowedMentions, { parse: [] });
});

const { createHandler } = require("../src/panel/server");
const session = require("../src/panel/session");
const ADMIN = "111111111111111111";
const guild = {
    id: "g", ownerId: "0",
    roles: { cache: new Map([["r-admin", { id: "r-admin", name: "Admin", position: 5 }]]), fetch: async () => {} },
    channels: { cache: new Map([["c-ann", channel]]), fetch: async () => new Map([["c-ann", channel]]) },
    members: { me: { roles: { highest: { position: 50 } } }, fetch: async () => ({ id: ADMIN, guild: { ownerId: "0" }, permissions: { has: () => false }, roles: { cache: new Set(["r-admin"]) }, user: { id: ADMIN, username: "a", globalName: "A", avatar: null } }) },
};
const config = { baseUrl: "https://panel.example.com", clientId: "1", clientSecret: "s", sessionSecret: "z".repeat(40), guildId: "g", adminRoleId: "r-admin" };
const cookie = `${session.SESSION_COOKIE}=${session.sign(config.sessionSecret, { uid: ADMIN, csrf: "tok", exp: Date.now() + 3600e3 })}`;
let server;
let base;
before(async () => {
    server = http.createServer(createHandler({ client: { ...fakeClient, guilds: { fetch: async () => guild } }, pool, config }));
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.closeAllConnections(); server.close(); });
const post = (fields) => fetch(`${base}/announcements/save`, { method: "POST", redirect: "manual", headers: { cookie, origin: config.baseUrl, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrf: "tok", color: "#F4A11C", ...fields }) });

test("panel: a ping needs confirming, sending now posts, scheduling needs a future time", async () => {
    const before = sent.length;
    assert.equal((await post({ channelId: "c-ann", title: "Γεια", ping: "everyone", action: "now" })).status, 400);
    assert.equal(sent.length, before);
    assert.equal((await post({ channelId: "c-ann", title: "Γεια", ping: "everyone", action: "now", confirm: "1" })).status, 303);
    assert.equal(sent.length, before + 1);
    assert.equal(sent.at(-1).content, "@everyone");
    assert.equal((await post({ channelId: "c-ann", title: "Αργότερα", action: "schedule", sendAt: "2020-01-01T10:00" })).status, 400);
    assert.equal((await post({ channelId: "c-ann", title: "Αργότερα", action: "schedule", sendAt: "2099-01-01T10:00" })).status, 303);
    assert.equal((await post({ title: "Πρόχειρο", action: "draft" })).status, 303);
    const list = await (await fetch(`${base}/announcements`, { headers: { cookie } })).text();
    assert.match(list, /Προγραμματισμένη για/);
    assert.match(list, /Πρόχειρο/);
});
