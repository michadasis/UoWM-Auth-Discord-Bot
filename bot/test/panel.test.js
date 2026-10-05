const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { createHandler, loadConfig } = require("../src/panel/server");
const session = require("../src/panel/session");
const access = require("../src/panel/access");

const SECRET = "x".repeat(40);
const ADMIN = "111111111111111111";
const MOD = "222222222222222222";
const RANDOM = "333333333333333333";
const OWNER = "444444444444444444";

const roles = { [ADMIN]: ["admin-role"], [MOD]: ["mod-role"], [RANDOM]: [], [OWNER]: [] };
function member(id) {
    if (!(id in roles)) return null;
    return {
        id,
        guild: { ownerId: OWNER },
        permissions: { has: () => false },
        roles: { cache: new Set(roles[id]) },
        user: { id, username: `user${id.slice(0, 3)}`, globalName: `Χρήστης ${id.slice(0, 3)}`, avatar: null, tag: `user${id.slice(0, 3)}` },
    };
}
const guild = { name: "Πληροφορική UoWM", memberCount: 150, members: { fetch: async ({ user }) => { const m = member(user); if (!m) throw new Error("Unknown Member"); return m; } } };
const client = { readyTimestamp: Date.now(), ws: { ping: 42 }, guilds: { fetch: async () => guild } };
const revoked = new Map(); // bot_meta keys for "log out everywhere"
const pool = { query: async (sql, p = []) => {
    if (sql.startsWith("SELECT meta_value")) return revoked.has(p[0]) ? [{ meta_value: revoked.get(p[0]) }] : [];
    return sql.includes("FROM guests") ? [{ n: 3 }] : [{ affiliation: "student", n: 90 }, { affiliation: "faculty", n: 6 }];
} };
const config = { baseUrl: "https://panel.example.com:25569", clientId: "999", clientSecret: "s", sessionSecret: SECRET, guildId: "g", adminRoleId: "admin-role", moderatorRoleId: "mod-role" };

let server;
let base;
let nextUser = ADMIN;
before(async () => {
    const handler = createHandler({ client, pool, config, fetchUser: async ({ code }) => ({ id: code === "bad" ? RANDOM : nextUser }) });
    server = http.createServer(handler);
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const get = (path, cookie) => fetch(base + path, { redirect: "manual", headers: cookie ? { cookie } : {} });
const setCookies = (res) => res.headers.getSetCookie();
const cookieValue = (res, name) => setCookies(res).map((c) => c.split(";")[0]).find((c) => c.startsWith(`${name}=`));

async function login(userId) {
    nextUser = userId;
    access.forget(userId);
    const start = await get("/auth/start");
    const state = new URL(start.headers.get("location")).searchParams.get("state");
    const stateCookie = cookieValue(start, session.STATE_COOKIE);
    return get(`/auth/callback?code=ok&state=${state}`, stateCookie);
}

test("anonymous visitors are sent to the login page, which is served with security headers", async () => {
    const res = await get("/");
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), "/login");
    const page = await get("/login");
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-security-policy"), /frame-ancestors 'none'/);
    assert.equal(page.headers.get("x-frame-options"), "DENY");
    assert.match(await page.text(), /Σύνδεση με Discord/);
});

test("login start redirects to Discord with a state bound to a signed cookie", async () => {
    const res = await get("/auth/start");
    const target = new URL(res.headers.get("location"));
    assert.equal(target.host, "discord.com");
    assert.equal(target.searchParams.get("redirect_uri"), "https://panel.example.com:25569/auth/callback");
    assert.equal(target.searchParams.get("scope"), "identify");
    const cookie = setCookies(res).find((c) => c.startsWith(session.STATE_COOKIE));
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Lax/);
});

test("callback with a wrong or missing state is refused", async () => {
    const start = await get("/auth/start");
    const stateCookie = cookieValue(start, session.STATE_COOKIE);
    assert.equal((await get("/auth/callback?code=ok&state=wrong", stateCookie)).status, 400);
    assert.equal((await get("/auth/callback?code=ok&state=wrong")).status, 400);
});

test("admins, moderators and the owner get in; others do not", async () => {
    for (const id of [ADMIN, MOD, OWNER]) {
        const res = await login(id);
        assert.equal(res.status, 303, id);
        assert.ok(cookieValue(res, session.SESSION_COOKIE), id);
        const page = await get("/", cookieValue(res, session.SESSION_COOKIE));
        assert.equal(page.status, 200);
        const html = await page.text();
        assert.match(html, /Επαληθευμένα μέλη/);
        assert.match(html, /90 φοιτητές/);
        assert.match(html, />96</); // verified total
    }
    const refused = await login(RANDOM);
    assert.equal(refused.status, 403);
    assert.equal(cookieValue(refused, session.SESSION_COOKIE), undefined);
});

test("a tampered or expired session is treated as logged out", async () => {
    const good = cookieValue(await login(ADMIN), session.SESSION_COOKIE);
    const tampered = good.slice(0, -3) + "abc";
    assert.equal((await get("/", tampered)).status, 303);
    const expired = `${session.SESSION_COOKIE}=${session.sign(SECRET, { uid: ADMIN, csrf: "c", exp: Date.now() - 1 })}`;
    assert.equal((await get("/", expired)).status, 303);
});

test("losing the role ends access on the next check", async () => {
    const cookie = cookieValue(await login(MOD), session.SESSION_COOKIE);
    roles[MOD] = [];
    access.forget(MOD);
    const res = await get("/", cookie);
    assert.equal(res.status, 403);
    roles[MOD] = ["mod-role"];
});

test("logout needs the CSRF token and a same-origin request", async () => {
    const cookie = cookieValue(await login(ADMIN), session.SESSION_COOKIE);
    const html = await (await get("/", cookie)).text();
    const csrf = html.match(/name="csrf" value="([^"]+)"/)[1];
    const post = (body, headers) => fetch(base + "/logout", { method: "POST", redirect: "manual", body, headers: { cookie, "content-type": "application/x-www-form-urlencoded", ...headers } });
    assert.equal((await post(`csrf=${csrf}`, {})).status, 403); // no Origin
    assert.equal((await post("csrf=wrong", { origin: config.baseUrl })).status, 403);
    assert.equal((await post(`csrf=${csrf}`, { origin: "https://evil.example" })).status, 403);
    const ok = await post(`csrf=${csrf}`, { origin: config.baseUrl });
    assert.equal(ok.status, 303);
    assert.match(setCookies(ok).join(), /Max-Age=0/);
});

test("unknown paths and methods", async () => {
    assert.equal((await get("/nope")).status, 404);
    assert.equal((await fetch(base + "/logout", { redirect: "manual" })).status, 405);
});

test("login routes are rate limited", async () => {
    let last;
    for (let i = 0; i < 25; i++) last = await get("/auth/start");
    assert.equal(last.status, 429);
});

test("config: off without PANEL_PORT, strict about the rest", () => {
    const c = { application: { id: "999" } };
    assert.equal(loadConfig({}, c), null);
    const env = { PANEL_PORT: "25569", PANEL_URL: "https://panel.example.com:25569", PANEL_CERT_FILE: "a", PANEL_KEY_FILE: "b", PANEL_SESSION_SECRET: SECRET, DISCORD_CLIENT_SECRET: "s", GUILD_ID: "g" };
    assert.equal(loadConfig(env, c).clientId, "999");
    assert.throws(() => loadConfig({ ...env, PANEL_SESSION_SECRET: "short" }, c));
    assert.throws(() => loadConfig({ ...env, PANEL_URL: "http://panel.example.com" }, c));
    assert.throws(() => loadConfig({ ...env, DISCORD_CLIENT_SECRET: "" }, c));
});

test("polish: favicon, login notes and extra security headers", async () => {
    const icon = await get("/favicon.svg");
    assert.equal(icon.status, 200);
    assert.match(icon.headers.get("content-type"), /image\/svg\+xml/);
    assert.match(await (await get("/login?n=out")).text(), /Αποσυνδεθήκατε/);
    assert.match(await (await get("/login?n=cancelled")).text(), /ακυρώθηκε/);
    assert.doesNotMatch(await (await get("/login?n=<script>")).text(), /<script>/);
    const page = await get("/login");
    assert.match(page.headers.get("permissions-policy"), /camera=\(\)/);
    assert.equal(page.headers.get("x-robots-tag"), "noindex, nofollow");
    // An expired session cookie leads to the "expired" note.
    const expired = `${session.SESSION_COOKIE}=${session.sign(SECRET, { uid: ADMIN, csrf: "c", exp: Date.now() - 1 })}`;
    assert.equal((await get("/", expired)).headers.get("location"), "/login?n=expired");
});

test("panel access roles and members replace Admin and Moderator, owner always in", () => {
    const m = (id, roleIds, owner = "0") => ({ id, guild: { ownerId: owner }, permissions: { has: () => false }, roles: { cache: new Set(roleIds) } });
    const base = { adminRoleId: "admin", moderatorRoleId: "mod" };
    assert.equal(access.canUsePanel(m("1", ["mod"]), base), true);
    const limited = { ...base, accessRoleIds: ["panel"], accessUserIds: ["2"] };
    assert.equal(access.canUsePanel(m("1", ["mod"]), limited), false);
    assert.equal(access.canUsePanel(m("1", ["panel"]), limited), true);
    assert.equal(access.canUsePanel(m("2", []), limited), true);
    assert.equal(access.canUsePanel(m("3", [], "3"), limited), true); // owner
});

test("log out everywhere ends older sessions of that member", async () => {
    const cookie = `${session.SESSION_COOKIE}=${session.sign(SECRET, { uid: ADMIN, csrf: "c", iat: Date.now(), exp: Date.now() + 3600e3 })}`;
    assert.equal((await get("/", cookie)).status, 200);
    revoked.set(`panel_logout:${ADMIN}`, String(Date.now() + 1000));
    const after = await get("/", cookie);
    assert.equal(after.status, 303);
    assert.equal(after.headers.get("location"), "/login?n=expired");
    revoked.clear();
    revoked.set("panel_logout_all", String(Date.now() + 1000));
    assert.equal((await get("/", cookie)).status, 303);
    revoked.clear();
});
