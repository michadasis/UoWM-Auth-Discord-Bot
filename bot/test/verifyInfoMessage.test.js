const { test } = require("node:test");
const assert = require("node:assert/strict");

// The module talks to the shared pool; its queries are answered here instead.
const pool = require("../src/lib/database");
const meta = new Map([["verify_info_message", "c-verify:m-old"]]);
pool.query = async (sql, params = []) => {
    if (sql.startsWith("SELECT meta_value")) return meta.has(params[0]) ? [{ meta_value: meta.get(params[0]) }] : [];
    if (sql.startsWith("INSERT INTO bot_meta")) { meta.set(params[0], params[1]); return []; }
    if (sql.startsWith("DELETE FROM bot_meta")) { meta.delete(params[0]); return []; }
    return [];
};
const verifyInfo = require("../src/lib/verifyInfoMessage");

function fakeChannel() {
    const log = [];
    const messages = new Map();
    const make = (id, content) => {
        const m = {
            id, content,
            edit: async (opts) => { log.push(["edit", id, opts]); m.content = opts.content; return m; },
            delete: async () => { log.push(["delete", id]); messages.delete(id); },
        };
        messages.set(id, m);
        return m;
    };
    make("m-old", "παλιό κείμενο");
    let n = 0;
    const channel = {
        id: "c-verify",
        messages: { fetch: async (id) => { if (!messages.has(id)) throw Object.assign(new Error("gone"), { code: 10008 }); return messages.get(id); } },
        send: async (opts) => { log.push(["send", opts]); return make(`m-new-${++n}`, opts.content); },
    };
    return { channel, log, client: { channels: { fetch: async () => channel } } };
}

test("edit mode edits the posted message without pings and keeps it in place", async () => {
    meta.set("verify_info_message", "c-verify:m-old");
    const { client, log } = fakeChannel();
    verifyInfo.setNextMode("edit");
    await verifyInfo.sync(client);
    assert.equal(log.length, 1);
    assert.equal(log[0][0], "edit");
    assert.equal(log[0][1], "m-old");
    assert.deepEqual(log[0][2].allowedMentions, { parse: [] });
    assert.equal(log[0][2].content, verifyInfo.currentText());
    assert.equal(meta.get("verify_info_message"), "c-verify:m-old");
    assert.equal(verifyInfo.getNextMode(), null);
});

test("ping mode, and changes from outside the panel, post a new message and delete the old one", async () => {
    for (const mode of ["ping", null]) {
        meta.set("verify_info_message", "c-verify:m-old");
        const { client, log } = fakeChannel();
        if (mode) verifyInfo.setNextMode(mode);
        await verifyInfo.sync(client);
        assert.equal(log[0][0], "send", String(mode));
        assert.deepEqual(log[0][1].allowedMentions, { parse: ["everyone", "roles"] });
        assert.deepEqual(log[1], ["delete", "m-old"]);
        assert.equal(meta.get("verify_info_message"), "c-verify:m-new-1");
        assert.equal(verifyInfo.getNextMode(), null);
    }
});

test("an unchanged text does nothing and clears the pending choice", async () => {
    meta.set("verify_info_message", "c-verify:m-old");
    const { client, log, channel } = fakeChannel();
    (await channel.messages.fetch("m-old")).content = verifyInfo.currentText();
    verifyInfo.setNextMode("ping");
    await verifyInfo.sync(client);
    assert.deepEqual(log, []);
    assert.equal(verifyInfo.getNextMode(), null);
});
