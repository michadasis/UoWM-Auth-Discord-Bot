const { test } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("module");

// In-memory bot_meta instead of the database.
const meta = new Map();
const fakePool = {
    query: async (sql, params = []) => {
        if (sql.startsWith("SELECT meta_value")) return meta.has(params[0]) ? [{ meta_value: meta.get(params[0]) }] : [];
        if (sql.includes("INSERT INTO bot_meta")) { meta.set(params[0], params[1]); return []; }
        return [];
    },
};
const originalLoad = Module._load;
Module._load = function (request, ...rest) {
    if (/(^|\/)database$/.test(request)) return fakePool;
    return originalLoad.call(this, request, ...rest);
};
const { decide, ping, remove, restore, pending, delayMs } = require("../src/lib/semesterPing");
Module._load = originalLoad;

const config = { semesterRoleIds: ["sem-a", "sem-b"], allowedRoleIds: ["student", "guest"] };

test("decide: ping on a newly allowed role without semesters, clear on a new semester role", () => {
    assert.equal(decide([], ["student"], config), "ping");
    assert.equal(decide(["x"], ["x", "guest"], config), "ping");
    assert.equal(decide(["student"], ["student", "sem-a"], config), "clear");
    assert.equal(decide(["sem-a"], ["sem-a", "student"], config), null); // already has a semester
    assert.equal(decide(["guest"], ["guest", "student"], config), null); // could already pick
    assert.equal(decide([], ["professor"], config), null);
    assert.equal(decide(["student"], ["student"], config), null);
});

test("delay comes from SEMESTER_PING_SECONDS, default 5 seconds", () => {
    assert.equal(delayMs({}), 5000);
    assert.equal(delayMs({ SEMESTER_PING_SECONDS: "2" }), 2000);
    assert.equal(delayMs({ SEMESTER_PING_SECONDS: "0" }), 5000);
});

function fakeClient() {
    const messages = new Map();
    let next = 0;
    const channel = {
        send: async ({ content, allowedMentions }) => { const id = String(++next); messages.set(id, { content, allowedMentions }); return { id }; },
        messages: { delete: async (id) => { if (!messages.delete(id)) throw new Error("Unknown Message"); } },
    };
    return { messages, client: { channels: { fetch: async () => channel } } };
}

test("ping posts one mention per member, picking a semester deletes it, and it survives a restart", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    process.env.SEMESTER_CHANNEL_ID = "chan";
    process.env.SEMESTER_PING_SECONDS = "600";
    const { messages, client } = fakeClient();

    await ping(client, "u1");
    await ping(client, "u1"); // no duplicate
    assert.equal(messages.size, 1);
    const [msg] = messages.values();
    assert.match(msg.content, /^<@u1> /);
    assert.deepEqual(msg.allowedMentions, { users: ["u1"] });
    assert.ok(JSON.parse(meta.get("semester_pings")).u1);

    await remove(client, "u1");
    assert.equal(messages.size, 0);
    assert.deepEqual(JSON.parse(meta.get("semester_pings")), {});

    // Timeout path, and restore after a "restart".
    await ping(client, "u2");
    pending.forEach((p) => clearTimeout(p.timer));
    pending.clear();
    await restore(client);
    assert.ok(pending.has("u2"));
    t.mock.timers.tick(600000);
    await new Promise((r) => setImmediate(r));
    assert.equal(messages.size, 0);
});

test("no channel set: no ping", async () => {
    delete process.env.SEMESTER_CHANNEL_ID;
    const { messages, client } = fakeClient();
    await ping(client, "u3");
    assert.equal(messages.size, 0);
});
