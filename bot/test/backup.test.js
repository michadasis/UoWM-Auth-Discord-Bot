const { test } = require("node:test");
const assert = require("node:assert/strict");
const { exportAll, checkBackup, restoreAll } = require("../src/lib/backup");

// A small in-memory database covering the queries the backup uses.
function fakeDb() {
    const db = { settings: new Map(), texts: new Map(), replies: [], menus: [], meta: new Map([["auto_replies_seeded", "1"]]) };
    const pool = { query: async (sql, p = []) => {
        if (sql.startsWith("CREATE TABLE") || sql.startsWith("ALTER TABLE")) return [];
        if (sql.includes("information_schema")) return [{ n: 1 }];
        if (sql.startsWith("SELECT meta_value")) return db.meta.has(p[0]) ? [{ meta_value: db.meta.get(p[0]) }] : [];
        if (sql.includes("INSERT INTO bot_meta")) { db.meta.set(p[0], p[1]); return []; }
        if (sql.startsWith("SELECT setting_key")) return [...db.settings].map(([setting_key, setting_value]) => ({ setting_key, setting_value }));
        if (sql.startsWith("INSERT INTO settings")) { db.settings.set(p[0], p[1]); return []; }
        if (sql.startsWith("SELECT text_key")) return [...db.texts].map(([text_key, content]) => ({ text_key, content }));
        if (sql.startsWith("INSERT INTO texts")) { db.texts.set(p[0], p[1]); return []; }
        if (sql.startsWith("SELECT * FROM auto_replies")) return db.replies.map((r) => ({ ...r }));
        if (sql.startsWith("INSERT INTO auto_replies")) { db.replies.push({ id: db.replies.length + 1, name: p[0], triggers: p[1], reply: p[2], delete_after: p[3], enabled: p[4], channel_ids: p[5], cooldown_seconds: p[6] }); return []; }
        if (sql.startsWith("UPDATE auto_replies")) { Object.assign(db.replies.find((r) => r.id === p[8]), { name: p[0], triggers: p[1], reply: p[2], delete_after: p[3], enabled: p[4], channel_ids: p[5], cooldown_seconds: p[6] }); return []; }
        if (sql.startsWith("SELECT * FROM role_menus")) return db.menus.map((m) => ({ ...m }));
        if (sql.startsWith("INSERT INTO role_menus")) { db.menus.push({ id: db.menus.length + 1, name: p[0], channel_id: p[1], message_id: p[2], title: p[3], description: p[4], color: p[5], footer: p[6], footer_icon: p[7], buttons: p[8] }); return { insertId: db.menus.length }; }
        if (sql.startsWith("UPDATE role_menus")) { Object.assign(db.menus.find((m) => m.id === p[10]), { name: p[0], channel_id: p[1], message_id: p[2], title: p[3], description: p[4], color: p[5], footer: p[6], footer_icon: p[7], buttons: p[8] }); return []; }
        return [];
    } };
    return { db, pool };
}

test("checkBackup refuses what is not a panel backup", () => {
    assert.ok(checkBackup({}).length);
    assert.ok(checkBackup({ format: "uowm-auth-panel-backup", version: 99 }).length);
    assert.ok(checkBackup({ format: "uowm-auth-panel-backup", version: 1, autoReplies: [{ name: "" }] }).length);
    assert.deepEqual(checkBackup({ format: "uowm-auth-panel-backup", version: 1, settings: {}, autoReplies: [], roleMenus: [] }), []);
});

test("export then restore into another database, merging by name", async () => {
    const a = fakeDb();
    a.db.settings.set("BOT_STATUS", "Γεια");
    a.db.texts.set("periods", "[]");
    a.db.replies.push({ id: 1, name: "Παλιά θέματα", triggers: "παλια θεματ", reply: "Pinned", delete_after: 20, enabled: 1, channel_ids: "", cooldown_seconds: 120 });
    a.db.menus.push({ id: 1, name: "Εξάμηνα", channel_id: "c1", message_id: "m1", title: "T", description: "D", color: "#F4A11C", footer: "", footer_icon: "", buttons: JSON.stringify([{ roleId: "r1", label: "Α" }]) });
    const data = await exportAll(a.pool, { facultyText: "mvavva@uowm.gr # Βάββα Μαρία\n" });
    assert.equal(data.roleMenus[0].messageId, undefined); // message ids are not exported
    assert.deepEqual(checkBackup(JSON.parse(JSON.stringify(data))), []);

    const b = fakeDb();
    b.db.menus.push({ id: 1, name: "Εξάμηνα", channel_id: "c1", message_id: "m-live", title: "Old", description: "", color: "#000000", footer: "", footer_icon: "", buttons: "[]" });
    let faculty = null;
    const counts = await restoreAll(b.pool, data, "u1", { writeFaculty: async (t) => { faculty = t; } });
    assert.deepEqual(counts, { settings: 1, texts: 1, autoReplies: 1, roleMenus: 1, faculty: true });
    assert.equal(b.db.settings.get("BOT_STATUS"), "Γεια");
    assert.equal(b.db.replies[0].name, "Παλιά θέματα");
    assert.equal(b.db.menus.length, 1); // matched by name
    assert.equal(b.db.menus[0].title, "T");
    assert.equal(b.db.menus[0].message_id, "m-live"); // the published message is kept
    assert.match(faculty, /mvavva/);
    delete process.env.BOT_STATUS;
});
