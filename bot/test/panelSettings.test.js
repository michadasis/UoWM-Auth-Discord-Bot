const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");

for (const k of ["STUDENT_ROLE_ID", "PROFESSOR_ROLE_ID", "STAFF_ROLE_ID", "GUEST_ROLE_ID", "SEMESTER_ROLE_IDS", "SEMESTER_ALLOWED_ROLE_IDS", "ADMIN_CHANNEL_ID", "GUEST_CHANNEL_ID", "BOT_STATUS", "BOT_STATUS_INTERVAL"]) delete process.env[k];
process.env.ADMIN_ROLE_ID = "r-admin";
process.env.MODERATOR_ROLE_ID = "r-mod";
process.env.STUDENT_ROLE_ID = "r-student"; // the .env value

const { createHandler } = require("../src/panel/server");
const session = require("../src/panel/session");
const settings = require("../src/lib/settings");

// In-memory "settings" table.
const table = new Map();
const pool = {
    query: async (sql, params = []) => {
        if (sql.startsWith("CREATE TABLE")) return [];
        if (sql.startsWith("SELECT setting_key")) return [...table].map(([k, v]) => ({ setting_key: k, setting_value: v.value, updated_by: v.by }));
        if (sql.startsWith("INSERT INTO settings")) { table.set(params[0], { value: params[1], by: params[2] }); return []; }
        if (sql.startsWith("DELETE FROM settings")) { table.delete(params[0]); return []; }
        if (sql.includes("FROM guests")) return [{ n: 0 }];
        return [];
    },
};

const role = (id, name, position, managed = false) => ({ id, name, position, managed, color: 0 });
const roles = new Map([
    ["g", role("g", "@everyone", 0)],
    ["r-student", role("r-student", "Φοιτητής", 3)],
    ["r-student2", role("r-student2", "Φοιτητής 2", 4)],
    ["r-high", role("r-high", "Πάνω από το bot", 20)],
    ["r-bot", role("r-bot", "Dyno", 5, true)],
    ["r-admin", role("r-admin", "Admin", 15)],
    ["r-mod", role("r-mod", "Moderator", 14)],
    ["r-a", role("r-a", "Α Εξάμηνο", 2)],
    ["r-b", role("r-b", "Β Εξάμηνο", 1)],
]);
const channel = (id, name, canSend = true) => ({ id, name, type: 0, rawPosition: 1, parent: null, permissionsFor: () => ({ has: () => canSend }) });
const channels = new Map([["c-log", channel("c-log", "admin-log")], ["c-locked", channel("c-locked", "locked", false)]]);
const ADMIN = "111111111111111111";
const guild = {
    id: "g", name: "Πληροφορική UoWM", ownerId: "0", memberCount: 10,
    roles: { cache: roles, fetch: async () => roles },
    channels: { cache: channels, fetch: async () => channels },
    members: {
        me: { roles: { highest: { position: 10 } } },
        fetch: async () => ({ id: ADMIN, guild: { ownerId: "0" }, permissions: { has: () => false }, roles: { cache: new Set(["r-admin"]) }, user: { id: ADMIN, username: "admin", globalName: "Admin", avatar: null, tag: "admin" } }),
    },
};
const client = { readyTimestamp: Date.now(), ws: { ping: 1 }, guilds: { fetch: async () => guild }, channels: { fetch: async () => { throw new Error("no admin log in tests"); } } };
const config = { baseUrl: "https://panel.example.com", clientId: "1", clientSecret: "s", sessionSecret: "z".repeat(40), guildId: "g" };

let base;
let server;
const cookie = `${session.SESSION_COOKIE}=${session.sign(config.sessionSecret, { uid: ADMIN, csrf: "tok", exp: Date.now() + 3600e3 })}`;
before(async () => {
    server = http.createServer(createHandler({ client, pool, config }));
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());
beforeEach(async () => {
    for (const key of [...table.keys()]) await settings.setSetting(pool, key, null, ADMIN);
    process.env.ADMIN_ROLE_ID = "r-admin";
    process.env.MODERATOR_ROLE_ID = "r-mod";
});

// Like the browser: every field is sent with its current value, except the ones changed here.
// A key ending in __env drops that override.
function form(fields) {
    const body = new URLSearchParams({ csrf: "tok" });
    for (const def of settings.DEFINITIONS) {
        if (def.key in fields) continue;
        const current = process.env[def.key] || "";
        for (const v of def.type === "roles" ? current.split(",").filter(Boolean) : [current]) body.append(def.key, v);
    }
    for (const [key, value] of Object.entries(fields)) for (const v of [].concat(value)) body.append(key, v);
    return body;
}
const reset = (...keys) => { const body = form({}); for (const k of keys) body.append(`${k}__env`, "1"); return body; };
const save = (body, headers = { origin: config.baseUrl }) => fetch(`${base}/settings`, { method: "POST", redirect: "manual", body, headers: { cookie, "content-type": "application/x-www-form-urlencoded", ...headers } });

test("the settings page lists roles and channels from the server, without @everyone and bot roles", async () => {
    const html = await (await fetch(`${base}/settings`, { headers: { cookie } })).text();
    assert.match(html, /@Φοιτητής/);
    assert.match(html, /#admin-log/);
    assert.doesNotMatch(html, /@@everyone/);
    assert.doesNotMatch(html, /Dyno/);
    assert.match(html, /Από το .env/);
    assert.doesNotMatch(html, /Επαναφορά στην τιμή του .env/); // only for panel overrides
});

test("saving overrides .env, applies at once, and going back to .env restores it", async () => {
    const res = await save(form({ STUDENT_ROLE_ID: "r-student2", SEMESTER_ROLE_IDS: ["r-a", "r-b"], ADMIN_CHANNEL_ID: "c-log", BOT_STATUS: "Γράψε /auth" }));
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), "/settings?saved=1");
    assert.equal(process.env.STUDENT_ROLE_ID, "r-student2");
    assert.equal(process.env.SEMESTER_ROLE_IDS, "r-a,r-b");
    assert.equal(process.env.ADMIN_CHANNEL_ID, "c-log");
    assert.equal(process.env.BOT_STATUS, "Γράψε /auth");
    assert.equal(table.get("STUDENT_ROLE_ID").by, ADMIN);

    // Sending the page back unchanged changes nothing.
    await save(form({}));
    assert.equal(table.size, 4);

    await save(reset("STUDENT_ROLE_ID", "SEMESTER_ROLE_IDS", "ADMIN_CHANNEL_ID", "BOT_STATUS"));
    assert.equal(process.env.STUDENT_ROLE_ID, "r-student");
    assert.equal(table.size, 0);
});

test("invalid choices are refused and nothing is saved", async () => {
    for (const fields of [
        { STUDENT_ROLE_ID: "g" },             // @everyone
        { STUDENT_ROLE_ID: "r-bot" },         // managed
        { STUDENT_ROLE_ID: "r-high" },        // above the bot, which must assign it
        { SEMESTER_ROLE_IDS: ["r-a", "nope"] },
        { ADMIN_CHANNEL_ID: "c-locked" },     // bot cannot send there
        { BOT_STATUS: "x".repeat(200) },
        { BOT_STATUS: "ok\n" + "y".repeat(129) },   // one line too long
        { BOT_STATUS_INTERVAL: "0" },
        { BOT_STATUS_INTERVAL: "2.5" },
        { STUDENT_ROLE_ID: "r-student2", ADMIN_CHANNEL_ID: "missing" }, // one bad field blocks all
    ]) {
        const res = await save(form(fields));
        assert.equal(res.status, 400, JSON.stringify(fields));
        assert.match(await res.text(), /Δεν αποθηκεύτηκε τίποτα/);
        assert.equal(table.size, 0, JSON.stringify(fields));
    }
    // Roles that are only checked (not assigned) may sit above the bot.
    assert.equal((await save(form({ MODERATOR_ROLE_ID: "r-high" }))).status, 303);
    assert.equal(process.env.MODERATOR_ROLE_ID, "r-high");
    // Moving the Admin role away from the role of the member saving would lock them out.
    const lockout = await save(form({ ADMIN_ROLE_ID: "r-high" }));
    assert.equal(lockout.status, 400);
    assert.match(await lockout.text(), /θα έχανες κι εσύ την πρόσβαση/);
});

test("several statuses and an interval can be saved", async () => {
    const res = await save(form({ BOT_STATUS: "/auth για πρόσβαση στις σημειώσεις\r\n\r\nCompeting in Εξεταστική\nWatching τα deadlines", BOT_STATUS_INTERVAL: "3" }));
    assert.equal(res.status, 303);
    assert.equal(process.env.BOT_STATUS, "/auth για πρόσβαση στις σημειώσεις\nCompeting in Εξεταστική\nWatching τα deadlines");
    assert.equal(process.env.BOT_STATUS_INTERVAL, "3");
});

test("saving needs the CSRF token and a same-origin request", async () => {
    const body = form({ STUDENT_ROLE_ID: "r-student2" });
    body.set("csrf", "wrong");
    assert.equal((await save(body)).status, 403);
    assert.equal((await save(form({ STUDENT_ROLE_ID: "r-student2" }), { origin: "https://evil.example" })).status, 403);
    assert.equal(table.size, 0);
});

test("listeners run on every change", async () => {
    const seen = [];
    settings.onChange((key, value) => seen.push([key, value]));
    await save(form({ BOT_STATUS: "Καλημέρα" }));
    assert.deepEqual(seen.find(([k]) => k === "BOT_STATUS"), ["BOT_STATUS", "Καλημέρα"]);
});
