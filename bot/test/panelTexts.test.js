const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "panel-texts-"));
process.env.FACULTY_EMAILS_FILE = path.join(tmp, "faculty-emails.txt");
process.env.EMAIL_DOMAIN = "uowm.gr";
process.env.EMAIL_STUDENT_PATTERN = "^cs(\\d{4,6})$";
process.env.UNI_ID_HASH_SECRET = "h".repeat(40);
process.env.EMAIL_TRANSPORT = "console";
process.env.EMAIL_FROM = "test@example.com";
process.env.STUDENT_ROLE_ID = "r-student";
process.env.ADMIN_ROLE_ID = "r-admin";
fs.writeFileSync(process.env.FACULTY_EMAILS_FILE, "# faculty\nmvavva@uowm.gr\n");

const { createHandler } = require("../src/panel/server");
const session = require("../src/panel/session");
const texts = require("../src/lib/texts");
const { renderDiscord } = require("../src/panel/discordPreview");
const { toLines, fromLines } = require("../src/panel/periodLines");
const { renderTemplate, toTemplate } = require("../src/lib/verifyTemplate");

const table = new Map();
const pool = {
    query: async (sql, params = []) => {
        if (sql.startsWith("CREATE TABLE")) return [];
        if (sql.startsWith("SELECT text_key")) return [...table].map(([k, v]) => ({ text_key: k, content: v }));
        if (sql.startsWith("INSERT INTO texts")) { table.set(params[0], params[1]); return []; }
        if (sql.startsWith("DELETE FROM texts")) { table.delete(params[0]); return []; }
        return [];
    },
};
const roles = new Map([["r-student", { id: "r-student", name: "Φοιτητής" }], ["r-admin", { id: "r-admin", name: "Admin" }]]);
const channels = new Map([["c-sem", { id: "c-sem", name: "epilogh-eksamhnou" }]]);
const ADMIN = "111111111111111111";
const guild = {
    id: "g", ownerId: "0",
    roles: { cache: roles, fetch: async () => roles },
    channels: { cache: channels, fetch: async () => channels },
    members: { fetch: async () => ({ id: ADMIN, guild: { ownerId: "0" }, permissions: { has: () => false }, roles: { cache: new Set(["r-admin"]) }, user: { id: ADMIN, username: "a", globalName: "A", avatar: null, tag: "a" } }) },
};
const client = { guilds: { fetch: async () => guild }, channels: { fetch: async () => { throw new Error("no log"); } } };
const config = { baseUrl: "https://panel.example.com", clientId: "1", clientSecret: "s", sessionSecret: "z".repeat(40), guildId: "g" };
const cookie = `${session.SESSION_COOKIE}=${session.sign(config.sessionSecret, { uid: ADMIN, csrf: "tok", exp: Date.now() + 3600e3 })}`;

let server;
let base;
before(async () => {
    await texts.loadTexts(pool);
    server = http.createServer(createHandler({ client, pool, config }));
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const post = (pathname, fields) => fetch(base + pathname, {
    method: "POST", redirect: "manual",
    headers: { cookie, origin: config.baseUrl, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrf: "tok", ...fields }),
});
const page = async (pathname) => (await fetch(base + pathname, { headers: { cookie } })).text();

test("placeholders turn into role mentions and back", () => {
    const template = "Πάρτε τον ρόλο {Φοιτητής}. Ρωτήστε {Admin}.";
    const message = renderTemplate(template);
    assert.equal(message, "Πάρτε τον ρόλο <@&r-student>. Ρωτήστε <@&r-admin>.");
    assert.equal(toTemplate(message), template);
    assert.match(renderTemplate("{Καθηγητής}"), /«Καθηγητής»/); // role not set
});

test("the preview renders Discord markdown and escapes HTML", () => {
    const html = renderDiscord("# Τίτλος\n1. **Βήμα** <@&r-student>\n-# μικρά <script>alert(1)</script>\n<#c-sem> @everyone", { roles: new Map([["r-student", "Φοιτητής"]]), channels: new Map([["c-sem", "epilogh"]]) });
    assert.match(html, /<div class="h1">Τίτλος<\/div>/);
    assert.match(html, /<ol><li><strong>Βήμα<\/strong> <span class="mention">@Φοιτητής<\/span><\/li><\/ol>/);
    assert.match(html, /<div class="subtext">/);
    assert.match(html, /#epilogh/);
    assert.match(html, /@everyone/);
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;/);
});

test("verify text: opens with the file text, previews without saving, saves, resets", async () => {
    const first = await page("/verify-text");
    assert.match(first, /Για πρόσβαση στα κανάλια/);
    assert.match(first, /\{Φοιτητής\}/); // file text shown as a template

    const heard = [];
    texts.onTextChange((key) => heard.push(key));

    const preview = await post("/verify-text", { action: "preview", template: "# Νέο {Φοιτητής}" });
    assert.equal(preview.status, 200);
    assert.match(await preview.text(), /@Φοιτητής/);
    assert.equal(table.size, 0);

    // A changed text reposts the message with pings, so it needs the confirmation box.
    const unconfirmed = await post("/verify-text", { action: "save", template: "# Νέο {Φοιτητής}" });
    assert.equal(unconfirmed.status, 400);
    assert.match(await unconfirmed.text(), /ping/);
    assert.equal(table.size, 0);

    const saved = await post("/verify-text", { action: "save", template: "# Νέο {Φοιτητής}", confirm: "1" });
    assert.equal(saved.status, 303);
    assert.equal(table.get("verify_info"), "# Νέο {Φοιτητής}");
    assert.equal(texts.getText("verify_info"), "# Νέο {Φοιτητής}");
    assert.deepEqual(heard, ["verify_info"]);

    const reset = await post("/verify-text", { action: "reset" });
    assert.equal(reset.status, 303);
    assert.equal(texts.getText("verify_info"), null);
});

test("verify text: unknown placeholders and too long texts are refused", async () => {
    for (const template of ["{Φοιτητες}", "x".repeat(2001), "   "]) {
        const res = await post("/verify-text", { action: "save", template, confirm: "1" });
        assert.equal(res.status, 400);
        assert.match(await res.text(), /Δεν αποθηκεύτηκε τίποτα/);
    }
    assert.equal(table.has("verify_info"), false);
});

test("periods: lines round-trip and bad lines are refused", async () => {
    const { entries, errors } = fromLines("Χειμερινό | 09-28 | 01-08\nΠάσχα | easter-6 | easter+7\nΚατάληψη | 2026-11-02 | 2026-11-06\n# σχόλιο");
    assert.deepEqual(errors, []);
    assert.equal(entries.length, 3);
    assert.equal(toLines(entries), "Χειμερινό | 09-28 | 01-08\nΠάσχα | easter-6 | easter+7\nΚατάληψη | 2026-11-02 | 2026-11-06");
    for (const bad of ["Χωρίς διαχωριστικά", "Λάθος | 13-40 | 01-08", "Μισό | easter-6 | 05-01", "Ανάποδα | 2026-12-01 | 2026-11-01", ""]) {
        assert.ok(fromLines(bad).errors.length, bad);
    }

    const res = await post("/periods", { action: "save", lines: "Χειμερινό | 09-28 | 01-08" });
    assert.equal(res.status, 303);
    assert.deepEqual(JSON.parse(texts.getText("periods")), [{ name: "Χειμερινό", start: "09-28", end: "01-08" }]);
    assert.equal((await post("/periods", { action: "save", lines: "κάτι λάθος" })).status, 400);
    assert.match(await page("/periods"), /Χειμερινό/);
});

test("faculty list: saved to the file, invalid addresses refused", async () => {
    assert.match(await page("/faculty"), /mvavva@uowm\.gr/);
    const ok = await post("/faculty", { text: "# faculty\nmvavva@uowm.gr\nchvagionas@uowm.gr\n" });
    assert.equal(ok.status, 303);
    assert.match(fs.readFileSync(process.env.FACULTY_EMAILS_FILE, "utf8"), /chvagionas@uowm\.gr/);
    const bad = await post("/faculty", { text: "someone@gmail.com\n" });
    assert.equal(bad.status, 400);
    assert.match(fs.readFileSync(process.env.FACULTY_EMAILS_FILE, "utf8"), /chvagionas/); // unchanged
});

test("text pages need the CSRF token", async () => {
    const res = await fetch(base + "/periods", { method: "POST", redirect: "manual", headers: { cookie, origin: config.baseUrl, "content-type": "application/x-www-form-urlencoded" }, body: "csrf=wrong&action=save&lines=A%20%7C%2009-01%20%7C%2009-02" });
    assert.equal(res.status, 403);
});
