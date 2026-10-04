const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "panel-p1-"));
Object.assign(process.env, {
    FACULTY_EMAILS_FILE: path.join(tmp, "faculty-emails.txt"), EMAIL_DOMAIN: "uowm.gr", EMAIL_STUDENT_PATTERN: "^cs(\\d{4,6})$",
    UNI_ID_HASH_SECRET: "h".repeat(40), EMAIL_TRANSPORT: "console", EMAIL_FROM: "t@example.com", VERIFY_CHANNEL_ID: "c-verify",
});
delete process.env.WELCOME_CHANNEL_ID;
delete process.env.WELCOME_MESSAGE;
fs.writeFileSync(process.env.FACULTY_EMAILS_FILE, "# Staff\nmvavva@uowm.gr # Βάββα Μαρία\nchvagionas@uowm.gr # Βαγιώνας Χρήστος\n");

const { createHandler } = require("../src/panel/server");
const session = require("../src/panel/session");
const { identityHashFor } = require("../src/lib/emailVerification");
const { parseFacultyEntries, addFacultyLine, removeFacultyLine } = require("../src/panel/facultyFile");

const verifiedHash = identityHashFor(process.env.UNI_ID_HASH_SECRET, "faculty:mvavva");
const settingsTable = new Map();
const pool = { query: async (sql, p = []) => {
    if (sql.startsWith("SELECT uni_id_hash FROM users")) return p.includes(verifiedHash) ? [{ uni_id_hash: verifiedHash }] : [];
    if (sql.startsWith("SELECT setting_key")) return [...settingsTable].map(([k, v]) => ({ setting_key: k, setting_value: v, updated_by: null }));
    if (sql.startsWith("INSERT INTO settings")) { settingsTable.set(p[0], p[1]); return []; }
    if (sql.startsWith("DELETE FROM settings")) { settingsTable.delete(p[0]); return []; }
    return [];
} };
const channel = (id, name) => ({ id, name, type: 0, rawPosition: 1, parent: null, permissionsFor: () => ({ has: () => true }) });
const channels = new Map([["c-welcome", channel("c-welcome", "welcome")], ["c-verify", channel("c-verify", "επαλήθευση")]]);
const roles = new Map([["r-admin", { id: "r-admin", name: "Admin", position: 5 }]]);
const ADMIN = "111111111111111111";
const guild = {
    id: "g", ownerId: "0", roles: { cache: roles, fetch: async () => roles }, channels: { cache: channels, fetch: async () => channels },
    members: { me: { roles: { highest: { position: 50 } } }, fetch: async () => ({ id: ADMIN, guild: { ownerId: "0" }, permissions: { has: () => false }, roles: { cache: new Set(["r-admin"]) }, user: { id: ADMIN, username: "a", globalName: "A", avatar: null } }) },
};
const client = { guilds: { fetch: async () => guild }, channels: { fetch: async () => { throw new Error("no log"); } } };
const config = { baseUrl: "https://panel.example.com", clientId: "1", clientSecret: "s", sessionSecret: "z".repeat(40), guildId: "g", adminRoleId: "r-admin" };
const cookie = `${session.SESSION_COOKIE}=${session.sign(config.sessionSecret, { uid: ADMIN, csrf: "tok", exp: Date.now() + 3600e3 })}`;

let server;
let base;
before(async () => {
    server = http.createServer(createHandler({ client, pool, config }));
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.closeAllConnections(); server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });
const get = async (p) => (await fetch(base + p, { headers: { cookie } })).text();
const post = (p, fields) => fetch(base + p, { method: "POST", redirect: "manual", headers: { cookie, origin: config.baseUrl, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrf: "tok", ...fields }) });

test("grouped navigation with the current page marked, plus a mobile menu", async () => {
    const html = await get("/faculty");
    assert.match(html, /<nav class="side"/);
    assert.match(html, /<details class="mobile-nav"><summary>Καθηγητές<\/summary>/);
    assert.match(html, /href="\/faculty" class="on" aria-current="page"/);
    for (const group of ["Επισκόπηση", "Μέλη", "Μηνύματα", "Ρυθμίσεις"]) assert.match(html, new RegExp(`nav-title">${group}<`));
});

test("faculty file helpers keep comments and names", () => {
    const text = "# Staff\nmvavva@uowm.gr # Βάββα Μαρία\nchvagionas@uowm.gr\n";
    assert.deepEqual(parseFacultyEntries(text, "uowm.gr").map((e) => [e.local, e.name, e.section]), [["mvavva", "Βάββα Μαρία", "Staff"], ["chvagionas", "", "Staff"]]);
    const added = addFacultyLine(text, "aff02242@uowm.gr", "Μόσχου Καλλιόπη");
    assert.match(added, /# Added from the admin panel\.\naff02242@uowm\.gr # Μόσχου Καλλιόπη\n$/);
    assert.equal(removeFacultyLine(added, "mvavva", "uowm.gr").includes("mvavva"), false);
    assert.ok(removeFacultyLine(added, "mvavva", "uowm.gr").startsWith("# Staff\n"));
});

test("faculty table: names, verified status, add and remove", async () => {
    let html = await get("/faculty");
    assert.match(html, /Βάββα Μαρία/);
    assert.match(html, /1 από 2 έχουν ήδη επαληθευτεί/);
    assert.equal((await post("/faculty/add", { email: "aff02242@uowm.gr", name: "Μόσχου Καλλιόπη" })).status, 303);
    assert.match(fs.readFileSync(process.env.FACULTY_EMAILS_FILE, "utf8"), /aff02242@uowm\.gr # Μόσχου Καλλιόπη/);
    assert.equal((await post("/faculty/add", { email: "aff02242@uowm.gr", name: "" })).status, 400); // duplicate
    assert.equal((await post("/faculty/add", { email: "x@gmail.com", name: "" })).status, 400);
    assert.equal((await post("/faculty/remove", { email: "chvagionas@uowm.gr" })).status, 303);
    html = await get("/faculty");
    assert.doesNotMatch(html, /chvagionas/);
});

test("welcome page: preview with the default text, save channel and text", async () => {
    let html = await get("/welcome");
    assert.match(html, /Καλώς ήρθες <span class="mention">@Νέο μέλος<\/span>/);
    assert.match(html, /#επαλήθευση/);
    assert.equal((await post("/welcome", { WELCOME_CHANNEL_ID: "c-welcome", WELCOME_MESSAGE: "Γεια {μέλος}!" })).status, 303);
    assert.equal(process.env.WELCOME_CHANNEL_ID, "c-welcome");
    assert.equal(process.env.WELCOME_MESSAGE, "Γεια {μέλος}!");
    html = await get("/welcome");
    assert.match(html, /Γεια <span class="mention">@Νέο μέλος<\/span>!/);
    // The settings page no longer has the welcome fields, and saving it leaves them alone.
    assert.doesNotMatch(await get("/settings"), /WELCOME_CHANNEL_ID/);
});

test("live preview endpoints", async () => {
    const welcome = await (await post("/welcome/preview", { text: "Γεια {μέλος}" })).json();
    assert.match(welcome.html, /@Νέο μέλος/);
    const menu = await (await post("/role-menus/preview", { text: "**Έντονα**" })).json();
    assert.match(menu.html, /<strong>Έντονα<\/strong>/);
    const reply = await (await post("/replies/preview", { text: "δες {εξάμηνα}" })).json();
    assert.match(reply.html, /#επιλογή-εξαμήνου/);
});

test("the client script parses and wires the new features", async () => {
    const js = await (await fetch(base + "/panel.js")).text();
    assert.doesNotThrow(() => new Function(js));
    for (const hook of ["data-live-preview", "data-live-text", "data-unsaved", "data-filter", "beforeunload"]) assert.ok(js.includes(hook.replace("data-", "").replace(/-(\w)/g, (_, c) => c.toUpperCase())) || js.includes(hook), hook);
});
