const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const dbBackup = require("../src/lib/dbBackup");
const { outsideServer } = require("../src/lib/codeEntry");

process.env.GUILD_ID = "g";

test("/auth and /code are registered for servers only", () => {
    for (const file of ["auth", "code"]) {
        const json = require(`../src/commands/utility/${file}`).data.toJSON();
        assert.deepEqual(json.contexts, [0], file); // 0 = Guild
    }
});

test("outside our server, verification refuses with a private reply", async () => {
    const replies = [];
    const fake = (inGuild, guildId) => ({ inGuild: () => inGuild, guildId, reply: async (r) => replies.push(r) });
    assert.equal(await outsideServer(fake(true, "g")), false);
    assert.equal(await outsideServer(fake(false, null)), true); // DM
    assert.equal(await outsideServer(fake(true, "other")), true); // another server
    assert.equal(replies.length, 2);
    assert.match(replies[0].content, /μόνο μέσα στον server/);
});

function fakeDb(tables) {
    const db = JSON.parse(JSON.stringify(tables));
    const conn = {
        beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
        query: async (sql, params = []) => {
            const t = sql.match(/`(\w+)`/)[1];
            if (sql.startsWith("DELETE")) { db[t] = []; return []; }
            const cols = sql.match(/\(([^)]*)\) VALUES/)[1].split(",").map((c) => c.replace(/`/g, ""));
            for (let i = 0; i < params.length; i += cols.length) db[t].push(Object.fromEntries(cols.map((c, j) => [c, params[i + j]])));
            return [];
        },
    };
    return {
        db,
        pool: {
            getConnection: async () => conn,
            query: async (sql) => {
                if (sql.includes("information_schema.TABLES")) return Object.keys(db).map((t) => ({ t }));
                const t = sql.match(/`(\w+)`/)[1];
                return db[t].map((r) => ({ ...r }));
            },
        },
    };
}

test("database backup: all tables but the email codes, kept to the limit, restorable", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dbb-"));
    const { pool, db } = fakeDb({
        users: [{ discord_user_id: "1", affiliation: "student", verified_at: "2026-09-01" }],
        guests: [{ discord_id: "2", reason: "Erasmus" }],
        email_challenges: [{ discord_user_id: "3" }],
    });
    process.env.DB_BACKUP_KEEP = "2";
    const first = await dbBackup.createBackup(pool, { dir, now: new Date("2026-10-01T04:00:00Z") });
    assert.deepEqual(first.tables, { guests: 1, users: 1 });
    await dbBackup.createBackup(pool, { dir, now: new Date("2026-10-02T04:00:00Z") });
    await dbBackup.createBackup(pool, { dir, now: new Date("2026-10-03T04:00:00Z") });
    const list = await dbBackup.listBackups(dir);
    assert.deepEqual(list.map((b) => b.name), ["db-2026-10-03T04-00-00Z.json.gz", "db-2026-10-02T04-00-00Z.json.gz"]);
    assert.equal(list[0].createdAt, "2026-10-03T04:00:00Z");

    db.users = [];
    const data = await dbBackup.readBackup(path.join(dir, list[0].name));
    await dbBackup.restoreBackup(pool, data, () => {});
    assert.equal(db.users.length, 1);
    assert.equal(db.users[0].affiliation, "student");
    assert.equal(db.email_challenges.length, 1); // not in backups, left alone

    assert.equal(dbBackup.backupPath("../../etc/passwd", dir), null);
    assert.ok(dbBackup.backupPath(list[0].name, dir));
    delete process.env.DB_BACKUP_KEEP;
    fs.rmSync(dir, { recursive: true, force: true });
});

test("health endpoint: 200 when Discord and the database work, 503 otherwise, no login", async () => {
    const { createHandler } = require("../src/panel/server");
    let dbUp = true;
    const client = { isReady: () => true, guilds: { fetch: async () => ({}) } };
    const pool = { query: async () => { if (!dbUp) throw new Error("down"); return [{ 1: 1 }]; } };
    const server = http.createServer(createHandler({ client, pool, config: { baseUrl: "https://p.example.com", clientId: "1", clientSecret: "s", sessionSecret: "z".repeat(40), guildId: "g" } }));
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const url = `http://127.0.0.1:${server.address().port}/health`;
    let res = await fetch(url);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: "ok", discord: "ok", database: "ok" });
    dbUp = false;
    res = await fetch(url);
    assert.equal(res.status, 503);
    assert.equal((await res.json()).database, "down");
    server.closeAllConnections(); server.close();
});
