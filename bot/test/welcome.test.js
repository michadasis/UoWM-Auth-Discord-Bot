const { test } = require("node:test");
const assert = require("node:assert/strict");
const { renderWelcome, welcome, DEFAULT_WELCOME } = require("../src/lib/welcome");

test("default text with the member mention and the verify channel link", () => {
    assert.equal(renderWelcome("42", { VERIFY_CHANNEL_ID: "7" }), "Καλώς ήρθες <@42>, κάνε την επαλήθευση για να έχεις πρόσβαση: <#7>.");
    assert.match(renderWelcome("42", {}), /#επαλήθευση\.$/);
    assert.ok(DEFAULT_WELCOME.includes("{μέλος}"));
});

test("a custom text from the settings", () => {
    assert.equal(renderWelcome("42", { WELCOME_MESSAGE: "Γεια {μέλος}! Ξεκίνα από {επαλήθευση}", VERIFY_CHANNEL_ID: "7" }), "Γεια <@42>! Ξεκίνα από <#7>");
});

test("sends to the welcome channel, pings only the member, skips bots and an unset channel", async () => {
    const sent = [];
    const member = (bot = false) => ({ id: "42", user: { bot }, guild: { channels: { fetch: async (id) => ({ id, send: async (m) => { sent.push([id, m]); return m; } }) } } });
    await welcome(member(), { WELCOME_CHANNEL_ID: "1504997316489379921", VERIFY_CHANNEL_ID: "1553096833000017970" });
    assert.equal(sent.length, 1);
    assert.equal(sent[0][0], "1504997316489379921");
    assert.match(sent[0][1].content, /<@42>.*<#1553096833000017970>/);
    assert.deepEqual(sent[0][1].allowedMentions, { users: ["42"] });
    await welcome(member(true), { WELCOME_CHANNEL_ID: "1" });
    await welcome(member(), {});
    assert.equal(sent.length, 1);
});
