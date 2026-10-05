const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { textToLatin } = require("../src/lib/textMatch");
const autoReplies = require("../src/lib/autoReplies");

test("Greek and greeklish meet in one form", () => {
    for (const [a, b] of [
        ["Πού είναι τα παλιά θέματα;", "pou einai ta palia 8emata"],
        ["που βρίσκω λυμένα θέματα", "poy brisko lymena themata"],
        ["Ξέρει κανείς τα θέματα εξετάσεων;", "xerei kaneis ta themata eksetasewn"],
        ["ΠΑΛΙΑ ΘΕΜΑΤΑ!!", "palia themata"],
    ]) assert.equal(textToLatin(a), textToLatin(b), `${a} / ${b}`);
});

const rules = [autoReplies.toRule({ id: 1, name: "Παλιά θέματα", triggers: autoReplies.DEFAULT_RULE.triggers, reply: "x", delete_after: 20, enabled: 1 })];

test("triggers match whole phrases by word starts, in any order", () => {
    for (const text of ["Πού είναι τα παλιά θέματα;", "pou einai ta palia themata", "θέματα παλιά έχει κανείς;", "που βρισκω τα λυμενα θεματα του Δημοκα", "υπάρχουν θέματα εξετάσεων για φυσική;"]) {
        assert.ok(autoReplies.findRule(text, rules), text);
    }
    for (const text of ["καλημέρα σε όλους", "έχω ένα θέμα με το eclass", "τα παλιά τα χρόνια", ""]) {
        assert.equal(autoReplies.findRule(text, rules), null, text);
    }
    const off = [{ ...rules[0], enabled: false }];
    assert.equal(autoReplies.findRule("παλιά θέματα", off), null);
});

test("{εξάμηνα} becomes the semester channel link", () => {
    assert.equal(autoReplies.renderReply("δες {εξάμηνα}", { SEMESTER_CHANNEL_ID: "123" }), "δες <#123>");
    assert.equal(autoReplies.renderReply("δες {εξάμηνα}", {}), "δες #επιλογή-εξαμήνου");
});

test("a reply is sent once per member per rule within the cooldown, and deleted later", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const table = [];
    const pool = { query: async (sql, p = []) => {
        if (sql.startsWith("SELECT * FROM auto_replies")) return table;
        if (sql.startsWith("INSERT INTO auto_replies")) { table.push({ id: 1, name: p[0], triggers: p[1], reply: p[2], delete_after: p[3], enabled: 1 }); return []; }
        if (sql.startsWith("SELECT meta_value")) return [];
        return [];
    } };
    await autoReplies.loadAutoReplies(pool); // seeds the default rule
    assert.equal(autoReplies.getRules().length, 1);
    const sent = [];
    const deleted = [];
    const message = (user, content) => ({ content, author: { id: user }, reply: async (r) => { sent.push(r); return { delete: async () => deleted.push(r) }; } });
    assert.ok(await autoReplies.handleMessage(message("u1", "πού είναι τα παλιά θέματα;"), 1000));
    assert.equal(await autoReplies.handleMessage(message("u1", "παλια θεματα???"), 2000), null); // cooldown
    assert.ok(await autoReplies.handleMessage(message("u2", "palia themata?"), 3000));
    assert.equal(sent.length, 2);
    assert.deepEqual(sent[0].allowedMentions, { repliedUser: true, parse: [] });
    t.mock.timers.tick(20000);
    await new Promise((r) => setImmediate(r));
    assert.equal(deleted.length, 2);
});

test("rules limited to channels, and the per-rule wait", async () => {
    const scoped = [autoReplies.toRule({ id: 9, name: "Μόνο help", triggers: "παλια θεματ", reply: "x", delete_after: 0, enabled: 1, channel_ids: "c-help", cooldown_seconds: 0 })];
    assert.ok(autoReplies.findRule("παλιά θέματα", scoped, "c-help"));
    assert.equal(autoReplies.findRule("παλιά θέματα", scoped, "c-general"), null);
    assert.ok(autoReplies.findRule("παλιά θέματα", scoped)); // the panel tester ignores channels
    const rule = autoReplies.toRule({ id: 9, name: "x", triggers: "t", reply: "x", delete_after: 0, enabled: 1 });
    assert.equal(rule.cooldown, 120); // rows from before the column existed
    assert.deepEqual(rule.channelIds, []);
});
