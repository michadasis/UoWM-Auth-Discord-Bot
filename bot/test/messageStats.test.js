const { test } = require("node:test");
const assert = require("node:assert/strict");
const { dayKey, shouldCount, statsChannelId, parsePeriods, expandPeriods, orthodoxEaster, periodFor, totalsByPeriod, formatDay } = require("../src/lib/messageStats");

test("dayKey uses Greek time, not UTC", () => {
    // 22:30 UTC on 31 Dec is already 1 Jan in Athens (UTC+2 in winter).
    assert.equal(dayKey(new Date("2026-12-31T22:30:00Z")), "2027-01-01");
    assert.equal(dayKey(new Date("2026-12-31T21:30:00Z")), "2026-12-31");
});

test("only human messages in our server are counted", () => {
    const base = { guildId: "g", author: { bot: false }, webhookId: null, system: false };
    assert.equal(shouldCount(base, "g"), true);
    assert.equal(shouldCount({ ...base, guildId: "other" }, "g"), false);
    assert.equal(shouldCount({ ...base, author: { bot: true } }, "g"), false);
    assert.equal(shouldCount({ ...base, webhookId: "w" }, "g"), false);
    assert.equal(shouldCount({ ...base, system: true }, "g"), false);
});

test("thread messages count towards the parent channel", () => {
    assert.equal(statsChannelId({ id: "t", parentId: "c", isThread: () => true }), "c");
    assert.equal(statsChannelId({ id: "c", parentId: "cat", isThread: () => false }), "c");
});

const YEARLY = JSON.stringify([
    { name: "Εαρινό εξάμηνο", start: "02-16", end: "05-29" },
    { name: "Διακοπές Πάσχα", easter: { from: -6, to: 7 } },
    { name: "Χειμερινό εξάμηνο", start: "09-28", end: "01-08" },
    { name: "Διακοπές Χριστουγέννων", start: "12-24", end: "01-06" },
    { name: "Εξεταστική Ιανουαρίου-Φεβρουαρίου", start: "01-18", end: "02-05" },
]);

test("parsePeriods validates entries", () => {
    assert.equal(parsePeriods(YEARLY).length, 5);
    assert.throws(() => parsePeriods('[{"name":"x","start":"2027-1-1","end":"2027-02-01"}]'));
    assert.throws(() => parsePeriods('[{"name":"x","start":"2027-03-01","end":"2027-02-01"}]'));
    assert.throws(() => parsePeriods('[{"name":"x","start":"09-28","end":"2027-01-08"}]'));
    assert.throws(() => parsePeriods('[{"name":"x","start":"13-01","end":"01-08"}]'));
    assert.throws(() => parsePeriods('[{"name":"x","easter":{"from":7,"to":-6}}]'));
    assert.throws(() => parsePeriods('{"name":"x"}'));
});

test("orthodoxEaster matches known dates", () => {
    const iso = (y) => orthodoxEaster(y).toISOString().slice(0, 10);
    assert.equal(iso(2025), "2025-04-20");
    assert.equal(iso(2026), "2026-04-12");
    assert.equal(iso(2027), "2027-05-02");
});

test("yearly periods repeat, wrap into the next year and get the academic year", () => {
    const periods = expandPeriods(parsePeriods(YEARLY), 2026, 2027);
    const find = (name) => periods.find((p) => p.name === name);
    assert.deepEqual(find("Χειμερινό εξάμηνο 2026-2027"), { name: "Χειμερινό εξάμηνο 2026-2027", start: "2026-09-28", end: "2027-01-08" });
    assert.deepEqual(find("Εξεταστική Ιανουαρίου-Φεβρουαρίου 2026-2027"), { name: "Εξεταστική Ιανουαρίου-Φεβρουαρίου 2026-2027", start: "2027-01-18", end: "2027-02-05" });
    assert.deepEqual(find("Διακοπές Πάσχα 2025-2026"), { name: "Διακοπές Πάσχα 2025-2026", start: "2026-04-06", end: "2026-04-19" });
    assert.deepEqual(find("Διακοπές Πάσχα 2026-2027"), { name: "Διακοπές Πάσχα 2026-2027", start: "2027-04-26", end: "2027-05-09" });
});

test("dated periods are kept as is", () => {
    const periods = expandPeriods(parsePeriods('[{"name":"Κατάληψη","start":"2026-11-02","end":"2026-11-06"}]'), 2026, 2027);
    assert.deepEqual(periods, [{ name: "Κατάληψη", start: "2026-11-02", end: "2026-11-06" }]);
});

test("periodFor prefers the more specific overlapping period", () => {
    const periods = expandPeriods(parsePeriods(YEARLY), 2026, 2027);
    assert.equal(periodFor(periods, "2026-11-10").name, "Χειμερινό εξάμηνο 2026-2027");
    assert.equal(periodFor(periods, "2026-12-25").name, "Διακοπές Χριστουγέννων 2026-2027");
    assert.equal(periodFor(periods, "2027-01-07").name, "Χειμερινό εξάμηνο 2026-2027");
    assert.equal(periodFor(periods, "2026-04-10").name, "Διακοπές Πάσχα 2025-2026");
    assert.equal(periodFor(periods, "2026-07-15"), null);
});

test("totalsByPeriod puts each day in one period so the parts add up", () => {
    const periods = expandPeriods(parsePeriods(YEARLY), 2025, 2026);
    const days = [
        { day: "2026-12-20", count: 10 },
        { day: "2026-12-25", count: 3 },
        { day: "2026-12-30", count: 2 },
        { day: "2026-07-15", count: 4 },
    ].sort((a, b) => a.day.localeCompare(b.day));
    const groups = totalsByPeriod(days, periods, "Εκτός περιόδων");
    assert.deepEqual(groups.map((g) => [g.name, g.count]), [
        ["Εκτός περιόδων", 4],
        ["Χειμερινό εξάμηνο 2026-2027", 10],
        ["Διακοπές Χριστουγέννων 2026-2027", 5],
    ]);
    assert.equal(groups.reduce((sum, g) => sum + g.count, 0), 19);
});

test("formatDay", () => {
    assert.equal(formatDay("2027-01-05"), "5/1/2027");
});

test("chart colours periods by their name, breaks before exams", () => {
    const { kindOf, niceMax } = require("../src/lib/activityChart");
    assert.equal(kindOf({ name: "Εξεταστική Ιουνίου 2025-2026" }), "exams");
    assert.equal(kindOf({ name: "Διάλειμμα πριν την εξεταστική Ιουνίου 2025-2026" }), "break");
    assert.equal(kindOf({ name: "Καλοκαίρι 2025-2026" }), "break");
    assert.equal(kindOf({ name: "Χειμερινό εξάμηνο 2026-2027" }), "semester");
    assert.equal(kindOf(null), "outside");
    assert.deepEqual([3, 105, 380].map(niceMax), [4, 120, 400]);
});

test("chart renders to a PNG with the bundled font", () => {
    const { buildActivitySvg, renderPng } = require("../src/lib/activityChart");
    const periods = expandPeriods(parsePeriods(YEARLY), 2025, 2026);
    const png = renderPng(buildActivitySvg({ year: 2026, days: [{ day: "2026-03-01", count: 12 }], periods, today: "2026-09-30" }));
    assert.equal(png.subarray(1, 4).toString(), "PNG");
});

test("CSV has a row per day from the first counted day, zeros for quiet days", () => {
    const { buildActivityCsv, csvField } = require("../src/lib/activityCsv");
    const periods = expandPeriods(parsePeriods(YEARLY), 2025, 2026);
    const csv = buildActivityCsv({
        days: [{ day: "2026-12-22", count: 5 }, { day: "2026-12-24", count: 2 }],
        periods,
        lastDay: "2026-12-25",
        outsideName: "Εκτός περιόδων",
    });
    assert.ok(csv.startsWith("\uFEFF"));
    assert.deepEqual(csv.slice(1).trim().split("\r\n"), [
        "Ημερομηνία,Περίοδος,Μηνύματα",
        "2026-12-22,Χειμερινό εξάμηνο 2026-2027,5",
        "2026-12-23,Χειμερινό εξάμηνο 2026-2027,0",
        "2026-12-24,Διακοπές Χριστουγέννων 2026-2027,2",
        "2026-12-25,Διακοπές Χριστουγέννων 2026-2027,0",
    ]);
    assert.equal(csvField('Εξεταστική, "Ιούνιος"'), '"Εξεταστική, ""Ιούνιος"""');
});
