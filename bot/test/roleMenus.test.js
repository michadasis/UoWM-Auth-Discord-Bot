const { test } = require("node:test");
const assert = require("node:assert/strict");
const roleMenus = require("../src/lib/roleMenus");

process.env.SEMESTER_ROLE_IDS = "sem-g,sem-a,sem-b";
process.env.STUDENT_ROLE_ID = "student";
delete process.env.SEMESTER_ALLOWED_ROLE_IDS;

const role = (id, name, position, managed = false) => ({ id, name, position, managed });
function fakeGuild() {
    const roles = new Map([
        ["g", role("g", "@everyone", 0)], ["student", role("student", "Φοιτητής", 2)],
        ["sem-a", role("sem-a", "Α Εξάμηνο", 3)], ["sem-b", role("sem-b", "Β Εξάμηνο", 4)], ["sem-g", role("sem-g", "Γ Εξάμηνο", 5)],
        ["games", role("games", "Valorant", 6)], ["high", role("high", "Admin", 20)], ["dyno", role("dyno", "Dyno", 8, true)],
    ]);
    const emojis = new Map([["1", { id: "100000000000000001", name: "sem_a", animated: false }], ["2", { id: "100000000000000002", name: "sem_g", animated: false }]]);
    return { id: "g", roles: { cache: roles }, emojis: { cache: emojis }, members: { me: { permissions: { has: () => true }, roles: { highest: { position: 10 } } } } };
}

test("the Discord message: embed, rows of five, ids that name the menu and the role", () => {
    const menu = { id: 7, title: "T", description: "D", color: "#F4A11C", footer: "F", buttons: Array.from({ length: 7 }, (_, i) => ({ roleId: `r${i}`, label: `L${i}`, emoji: i === 0 ? "<:sem_a:100000000000000001>" : i === 1 ? "🔹" : "", style: "primary" })) };
    const msg = roleMenus.buildMessage(menu);
    assert.equal(msg.components.length, 2);
    const first = msg.components[0].toJSON().components[0];
    assert.equal(first.custom_id, "rolemenu:7:r0");
    assert.equal(first.emoji.id, "100000000000000001");
    assert.equal(msg.components[0].toJSON().components[1].emoji.name, "🔹");
    assert.equal(msg.embeds[0].toJSON().title, "T");
    assert.deepEqual(msg.allowedMentions, { parse: [] });
});

test("assignable: no @everyone, no managed roles, nothing above the bot", () => {
    const g = fakeGuild();
    assert.ok(roleMenus.assignable(g, "sem-a"));
    for (const id of ["g", "dyno", "high", "missing"]) assert.equal(roleMenus.assignable(g, id), null, id);
});

function clickSetup(memberRoles) {
    const g = fakeGuild();
    const roles = new Set(memberRoles);
    const member = { roles: { cache: roles, add: async (id) => roles.add(id), remove: async (id) => roles.delete(id) } };
    g.members.fetch = async () => member;
    const replies = [];
    const interaction = (customId) => ({ customId, guild: g, user: { id: "u1" }, deferReply: async () => {}, editReply: async (r) => replies.push(r.content) });
    return { roles, replies, interaction };
}

async function withMenu(fn) {
    const pool = { query: async (sql) => (sql.startsWith("SELECT * FROM role_menus") ? [{ id: 1, name: "Εξάμηνα", buttons: JSON.stringify([{ roleId: "sem-a" }, { roleId: "games" }]), description: "" }] : []) };
    await roleMenus.loadRoleMenus(pool);
    await fn();
}

test("a click toggles the role from the member's current roles", async () => withMenu(async () => {
    const { roles, replies, interaction } = clickSetup(["student", "sem-a"]); // sem-a given earlier, e.g. by Dyno
    await roleMenus.handleClick(interaction("rolemenu:1:sem-a"));
    assert.equal(roles.has("sem-a"), false);
    assert.match(replies.at(-1), /Αφαιρέθηκε/);
    await roleMenus.handleClick(interaction("rolemenu:1:sem-a"));
    assert.equal(roles.has("sem-a"), true);
    assert.match(replies.at(-1), /Πήρες/);
}));

test("semesters only for allowed members; other roles for everyone", async () => withMenu(async () => {
    const { roles, replies, interaction } = clickSetup([]);
    await roleMenus.handleClick(interaction("rolemenu:1:sem-a"));
    assert.equal(roles.has("sem-a"), false);
    assert.match(replies.at(-1), /\/auth/);
    await roleMenus.handleClick(interaction("rolemenu:1:games"));
    assert.equal(roles.has("games"), true);
}));

test("forged buttons cannot hand out other roles", async () => withMenu(async () => {
    const { roles, replies, interaction } = clickSetup(["student"]);
    await roleMenus.handleClick(interaction("rolemenu:1:high"));
    await roleMenus.handleClick(interaction("rolemenu:99:sem-a"));
    assert.equal(roles.size, 1);
    assert.match(replies[0], /δεν ισχύει/);
}));

test("the semester draft: roles in Α-Η order, matching sem_* emojis, seeded once", async () => {
    const rows = [];
    const meta = new Map();
    const pool = { query: async (sql, p = []) => {
        if (sql.startsWith("SELECT * FROM role_menus")) return rows;
        if (sql.startsWith("INSERT INTO role_menus")) { rows.push({ id: rows.length + 1, name: p[0], channel_id: p[1], message_id: p[2], title: p[3], description: p[4], color: p[5], footer: p[6], footer_icon: p[7], buttons: p[8] }); return { insertId: rows.length }; }
        if (sql.startsWith("SELECT meta_value")) return meta.has(p[0]) ? [{ meta_value: meta.get(p[0]) }] : [];
        if (sql.includes("INSERT INTO bot_meta")) { meta.set(p[0], p[1]); return []; }
        return [];
    } };
    await roleMenus.loadRoleMenus(pool);
    await roleMenus.seedSemesterMenu(pool, fakeGuild());
    await roleMenus.seedSemesterMenu(pool, fakeGuild());
    assert.equal(rows.length, 1);
    const buttons = JSON.parse(rows[0].buttons);
    assert.deepEqual(buttons.map((b) => b.label), ["Α Εξάμηνο", "Β Εξάμηνο", "Γ Εξάμηνο"]);
    assert.equal(buttons[0].emoji, "<:sem_a:100000000000000001>");
    assert.equal(buttons[1].emoji, "");
    assert.equal(buttons[2].emoji, "<:sem_g:100000000000000002>");
    assert.match(rows[0].description, /<#1504990025664696415>/);
});

test("footer image: server icon, URL, or none", () => {
    const base = { id: 1, title: "T", description: "", color: "#F4A11C", footer: "Πληροφορική UoWM", buttons: [] };
    const footer = (menu) => roleMenus.buildMessage(menu, { serverIconUrl: "https://cdn.discordapp.com/icons/1/a.png" }).embeds[0].toJSON().footer;
    assert.equal(footer({ ...base, footerIcon: "server" }).icon_url, "https://cdn.discordapp.com/icons/1/a.png");
    assert.equal(footer({ ...base, footerIcon: "https://example.com/x.png" }).icon_url, "https://example.com/x.png");
    assert.equal(footer({ ...base, footerIcon: "" }).icon_url, undefined);
    assert.equal(footer({ ...base, footerIcon: "javascript:alert(1)" }).icon_url, undefined);
});
