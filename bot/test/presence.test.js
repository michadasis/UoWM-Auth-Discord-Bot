const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ActivityType } = require("discord.js");
const { parseStatus, statusLines, intervalMs, createRotation, DEFAULT_STATUS } = require("../src/lib/presence");

test("the first word picks the activity type, anything else is a custom status", () => {
    assert.deepEqual(parseStatus("Competing in Εξεταστική"), { type: ActivityType.Competing, name: "Εξεταστική" });
    assert.deepEqual(parseStatus("Watching τα deadlines των εργασιών να πλησιάζουν"), { type: ActivityType.Watching, name: "τα deadlines των εργασιών να πλησιάζουν" });
    assert.deepEqual(parseStatus("playing με τα εργαστήρια"), { type: ActivityType.Playing, name: "με τα εργαστήρια" });
    assert.deepEqual(parseStatus("Listening to διαλέξεις"), { type: ActivityType.Listening, name: "διαλέξεις" });
    assert.deepEqual(parseStatus("/auth για πρόσβαση στις σημειώσεις"), { type: ActivityType.Custom, name: "status", state: "/auth για πρόσβαση στις σημειώσεις" });
    assert.deepEqual(parseStatus("Reading σημειώσεις"), { type: ActivityType.Custom, name: "status", state: "Reading σημειώσεις" });
    assert.equal(parseStatus("Watching").type, ActivityType.Custom); // prefix alone
});

test("status lines and interval", () => {
    assert.deepEqual(statusLines("α\n\n β \n"), ["α", "β"]);
    assert.deepEqual(statusLines("α\\nβ"), ["α", "β"]); // \n written in .env
    assert.deepEqual(statusLines(""), [DEFAULT_STATUS]);
    assert.equal(intervalMs({ BOT_STATUS_INTERVAL: "2" }), 120000);
    assert.equal(intervalMs({}), 300000);
    assert.equal(intervalMs({ BOT_STATUS_INTERVAL: "0" }), 300000);
});

test("the rotation shows each status in turn", (t) => {
    t.mock.timers.enable({ apis: ["setInterval"] });
    process.env.BOT_STATUS = "Ένα\nCompeting in Δύο\nWatching Τρία";
    process.env.BOT_STATUS_INTERVAL = "1";
    const shown = [];
    const client = { options: {}, user: { setPresence: (p) => shown.push(p.activities[0]) } };
    const rotation = createRotation(client);
    rotation.restart();
    t.mock.timers.tick(60000);
    t.mock.timers.tick(60000);
    t.mock.timers.tick(60000);
    rotation.stop();
    assert.deepEqual(shown.map((a) => a.state ?? a.name), ["Ένα", "Δύο", "Τρία", "Ένα"]);
    delete process.env.BOT_STATUS;
    delete process.env.BOT_STATUS_INTERVAL;
});
