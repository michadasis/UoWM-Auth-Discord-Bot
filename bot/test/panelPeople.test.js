const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const Module = require("module");

// One in-memory database for the panel and the verification/guest libraries.
const db = {
    users: [
        { discord_user_id: "100000000000000001", affiliation: "student", verified_at: new Date("2026-09-01") },
        { discord_user_id: "100000000000000002", affiliation: "faculty", verified_at: new Date("2026-09-02") },
        { discord_user_id: "100000000000000003", affiliation: "student", verified_at: new Date("2026-09-03") },
    ],
    guests: [{ discord_id: "100000000000000004", reason: "μεταγραφή", given_by: "111111111111111111", msg_id: "m1" }],
    log: [],
};
const pool = {
    query: async (sql, params = []) => {
        if (sql.startsWith("SELECT discord_user_id, affiliation, verified_at FROM users")) return [...db.users];
        if (sql.startsWith("SELECT affiliation, verified_at FROM users WHERE")) return db.users.filter((u) => u.discord_user_id === params[0]);
        if (sql.startsWith("DELETE FROM users")) { db.users = db.users.filter((u) => u.discord_user_id !== params[0]); return []; }
        if (sql.startsWith("SELECT discord_id, reason, given_by FROM guests")) return [...db.guests];
        if (sql.startsWith("SELECT msg_id FROM guests")) return db.guests.filter((g) => g.discord_id === params[0]);
        if (sql.startsWith("DELETE FROM guests")) { db.guests = db.guests.filter((g) => g.discord_id !== params[0]); return []; }
        if (sql.startsWith("INSERT INTO guests")) { db.guests.push({ discord_id: params[0], reason: params[1], given_by: params[2] }); return []; }
        if (sql.startsWith("INSERT INTO panel_log")) { db.log.push(params); return []; }
        return [];
    },
};
const original = Module._load;
Module._load = function (request, ...rest) {
    if (/(^|\/)database$/.test(request)) return pool;
    return original.call(this, request, ...rest);
};
const { createHandler } = require("../src/panel/server");
const session = require("../src/panel/session");
Module._load = original;

process.env.STUDENT_ROLE_ID = "r-student";
process.env.GUEST_ROLE_ID = "r-guest";
const ADMIN = "111111111111111111";
const removedRoles = [];
const addedRoles = [];
function member(id, username, displayName) {
    return {
        id, displayName, guild: { ownerId: "0" }, permissions: { has: () => false },
        roles: { cache: new Map([["r-admin", {}], ["r-student", {}]]), add: async (r) => addedRoles.push([id, r]), remove: async (r) => removedRoles.push([id, r]) },
        user: { id, username, globalName: displayName, avatar: null, bot: false, tag: username },
        send: async () => {},
    };
}
const members = new Map([
    [ADMIN, member(ADMIN, "mich", "Mich")],
    ["100000000000000001", member("100000000000000001", "nikos_p", "Νίκος Παπαδόπουλος")],
    ["100000000000000003", member("100000000000000003", "maria.k", "Μαρία Κ")],
    ["100000000000000004", member("100000000000000004", "guest1", "Γιώργος")],
    ["100000000000000005", member("100000000000000005", "eleni", "Ελένη")],
    ["100000000000000006", member("100000000000000006", "eleni2", "Ελένη")],
]);
members.get(ADMIN).roles.cache = new Map([["r-admin", {}]]);
const guild = {
    id: "g", ownerId: "0", memberCount: members.size,
    members: { cache: members, fetch: async (arg) => { if (arg === undefined) return members; const id = typeof arg === "string" ? arg : arg.user; const m = members.get(id); if (!m) throw new Error("Unknown Member"); return m; } },
    channels: { cache: new Map(), fetch: async (id) => (id ? { send: async () => ({ id: "m2" }), messages: { fetch: async () => ({ delete: async () => {} }) } } : new Map()) },
    roles: { cache: new Map([["r-student", { id: "r-student", name: "Φοιτητής" }]]), fetch: async () => {} },
};
const client = { guilds: { fetch: async () => guild }, channels: { fetch: async () => { throw new Error("no channel"); } } };
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
const post = (p, fields) => fetch(base + p, { method: "POST", redirect: "manual", headers: { cookie, origin: config.baseUrl, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrf: "tok", ...fields }) });

test("members: list, search ignoring accents, filter, out-of-server marker", async () => {
    const all = await get("/members");
    assert.match(all, /3 επαληθευμένα μέλη/);
    assert.match(all, /Νίκος Παπαδόπουλος/);
    assert.match(all, /εκτός server/); // 100000000000000002 is not a member any more
    const search = await get("/members?q=" + encodeURIComponent("νικος"));
    assert.match(search, /1 επαληθευμένα μέλη/);
    assert.match(search, /Νίκος/);
    assert.doesNotMatch(search, /Μαρία/);
    assert.match(await get("/members?aff=faculty"), /1 επαληθευμένα μέλη/);
});

test("members: unverify removes the record and roles and is logged", async () => {
    const res = await post("/members/unverify", { id: "100000000000000003" });
    assert.equal(res.status, 303);
    assert.ok(!db.users.some((u) => u.discord_user_id === "100000000000000003"));
    assert.ok(removedRoles.some(([id]) => id === "100000000000000003"));
    assert.ok(db.log.some(([, area, text]) => area === "Αφαίρεση επαλήθευσης" && /Μαρία Κ/.test(text)));
    assert.equal((await post("/members/unverify", { id: "not-an-id" })).status, 303); // ignored
});

test("guests: give by username, refuse ambiguous names, remove", async () => {
    assert.match(await get("/guests"), /μεταγραφή/);
    const ambiguous = await post("/guests/give", { who: "Ελένη", reason: "μεταγραφή" });
    assert.equal(ambiguous.status, 400);
    assert.match(await ambiguous.text(), /Ταιριάζουν πολλά μέλη/);
    assert.equal((await post("/guests/give", { who: "eleni2", reason: "" })).status, 400);

    const ok = await post("/guests/give", { who: "@eleni2", reason: "Erasmus" });
    assert.equal(ok.status, 303);
    assert.ok(addedRoles.some(([id, role]) => id === "100000000000000006" && role === "r-guest"));
    assert.ok(db.guests.some((g) => g.discord_id === "100000000000000006" && g.reason === "Erasmus"));

    const removed = await post("/guests/remove", { id: "100000000000000004" });
    assert.equal(removed.status, 303);
    assert.ok(!db.guests.some((g) => g.discord_id === "100000000000000004"));
});

test("live preview returns rendered HTML and needs the CSRF token", async () => {
    const res = await post("/verify-text/preview", { template: "# Γεια {Φοιτητής}" });
    const data = await res.json();
    assert.match(data.html, /<div class="h1">Γεια/);
    assert.equal(data.maxLength, 2000);
    const bad = await fetch(base + "/verify-text/preview", { method: "POST", headers: { cookie, origin: config.baseUrl, "content-type": "application/x-www-form-urlencoded" }, body: "csrf=wrong&template=x" });
    assert.equal(bad.status, 403);
});

test("the client script is served and allowed by the CSP", async () => {
    const res = await fetch(base + "/panel.js");
    assert.match(res.headers.get("content-type"), /javascript/);
    assert.match(await res.text(), /data-confirm|dataset\.confirm/);
    assert.match((await fetch(base + "/login")).headers.get("content-security-policy"), /script-src 'self'/);
});
