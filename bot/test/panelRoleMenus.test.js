const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");

process.env.SEMESTER_ROLE_IDS = "sem-b,sem-a";
process.env.SEMESTER_CHANNEL_ID = "c-sem";
const { createHandler } = require("../src/panel/server");
const session = require("../src/panel/session");

const rows = [];
const meta = new Map();
const pool = { query: async (sql, p = []) => {
    if (sql.startsWith("SELECT * FROM role_menus")) return rows.map((r) => ({ ...r }));
    if (sql.startsWith("INSERT INTO role_menus")) { rows.push({ id: rows.length + 1, name: p[0], channel_id: p[1], message_id: p[2], title: p[3], description: p[4], color: p[5], footer: p[6], footer_icon: p[7], buttons: p[8] }); return { insertId: rows.length }; }
    if (sql.startsWith("UPDATE role_menus")) { const r = rows.find((x) => x.id === p[10]); Object.assign(r, { name: p[0], channel_id: p[1], message_id: p[2], title: p[3], description: p[4], color: p[5], footer: p[6], footer_icon: p[7], buttons: p[8] }); return []; }
    if (sql.startsWith("DELETE FROM role_menus")) { rows.splice(rows.findIndex((x) => x.id === Number(p[0])), 1); return []; }
    if (sql.startsWith("SELECT meta_value")) return meta.has(p[0]) ? [{ meta_value: meta.get(p[0]) }] : [];
    if (sql.includes("INSERT INTO bot_meta")) { meta.set(p[0], p[1]); return []; }
    return [];
} };

const posted = [];
const role = (id, name, position) => ({ id, name, position, managed: false });
const roles = new Map([["g", role("g", "@everyone", 0)], ["sem-a", role("sem-a", "Α Εξάμηνο", 3)], ["sem-b", role("sem-b", "Β Εξάμηνο", 4)], ["high", role("high", "Πολύ ψηλά", 50)], ["r-admin", role("r-admin", "Admin", 40)]]);
const channel = { id: "c-sem", name: "επιλογή-εξαμήνου", type: 0, rawPosition: 1, parent: null, permissionsFor: () => ({ has: () => true }),
    send: async (payload) => { posted.push(payload); return { id: `m${posted.length}` }; },
    messages: { fetch: async (id) => ({ id, edit: async (payload) => posted.push({ edited: id, ...payload }), delete: async () => {} }) } };
const channels = new Map([["c-sem", channel]]);
const ADMIN = "111111111111111111";
const guild = {
    id: "g", ownerId: "0",
    roles: { cache: roles, fetch: async () => roles },
    channels: { cache: channels, fetch: async () => channels },
    emojis: { cache: new Map(), fetch: async () => {} },
    members: { me: { permissions: { has: () => true }, roles: { highest: { position: 10 } } }, fetch: async () => ({ id: ADMIN, guild: { ownerId: "0" }, permissions: { has: () => false }, roles: { cache: new Set(["r-admin"]) }, user: { id: ADMIN, username: "a", globalName: "A", avatar: null } }) },
};
const client = { guilds: { fetch: async () => guild }, channels: { fetch: async () => channel } };
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
function post(p, fields) {
    const body = new URLSearchParams({ csrf: "tok" });
    for (const [k, v] of fields) body.append(k, v);
    return fetch(base + p, { method: "POST", redirect: "manual", headers: { cookie, origin: config.baseUrl, "content-type": "application/x-www-form-urlencoded" }, body });
}
const menuFields = (extra = []) => [["id", "1"], ["name", "Επιλογή εξαμήνου"], ["channelId", "c-sem"], ["title", "Τίτλος"], ["description", "Κείμενο"], ["color", "#F4A11C"], ["footer", ""], ...extra];
const button = (pos, roleId, label = "", style = "primary") => [["btn_pos", String(pos)], ["btn_role", roleId], ["btn_label", label], ["btn_emoji", ""], ["btn_emoji_text", ""], ["btn_style", style]];

test("the page seeds a semester draft with the roles in order", async () => {
    const html = await get("/role-menus");
    assert.match(html, /Επιλογή εξαμήνου/);
    assert.match(html, /Πρόχειρο/);
    const buttons = JSON.parse(rows[0].buttons);
    assert.deepEqual(buttons.map((b) => b.roleId), ["sem-a", "sem-b"]);
});

test("publish posts the message, publishing again edits it in place", async () => {
    let res = await post("/role-menus/save", [...menuFields([["action", "publish"]]), ...button(2, "sem-b"), ...button(1, "sem-a", "Α")]);
    assert.equal(res.status, 303);
    assert.equal(posted.length, 1);
    const ids = posted[0].components[0].toJSON().components.map((c) => c.custom_id);
    assert.deepEqual(ids, ["rolemenu:1:sem-a", "rolemenu:1:sem-b"]); // sorted by the # column
    assert.equal(rows[0].message_id, "m1");
    res = await post("/role-menus/save", [...menuFields([["action", "publish"]]), ...button(1, "sem-a")]);
    assert.equal(res.status, 303);
    assert.equal(posted[1].edited, "m1");
    assert.equal(rows[0].message_id, "m1");
});

test("roles the bot cannot give and duplicates are refused", async () => {
    for (const extra of [button(1, "high"), [...button(1, "sem-a"), ...button(2, "sem-a")]]) {
        const res = await post("/role-menus/save", [...menuFields([["action", "save"]]), ...extra]);
        assert.equal(res.status, 400);
        assert.match(await res.text(), /Δεν αποθηκεύτηκε τίποτα/);
    }
});

test("footer image needs footer text and an https URL", async () => {
    const withIcon = (mode, url, footer) => [["id", "1"], ["name", "Ε"], ["channelId", "c-sem"], ["title", "T"], ["description", "D"], ["color", "#F4A11C"], ["footer", footer], ["footerIconMode", mode], ["footerIconUrl", url], ["action", "save"], ...button(1, "sem-a")];
    assert.equal((await post("/role-menus/save", withIcon("server", "", ""))).status, 400);
    assert.equal((await post("/role-menus/save", withIcon("url", "http://insecure.example/x.png", "F"))).status, 400);
    assert.equal((await post("/role-menus/save", withIcon("server", "", "Πληροφορική UoWM"))).status, 303);
    assert.equal(rows[0].footer_icon, "server");
    assert.equal((await post("/role-menus/save", withIcon("url", "https://example.com/logo.png", "F"))).status, 303);
    assert.equal(rows[0].footer_icon, "https://example.com/logo.png");
});

test("delete removes the menu", async () => {
    const res = await post("/role-menus/delete", [["id", "1"]]);
    assert.equal(res.status, 303);
    assert.equal(rows.length, 0);
});
