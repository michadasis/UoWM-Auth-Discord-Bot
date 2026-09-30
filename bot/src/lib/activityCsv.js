// CSV export for /stats activity: one row per day, with its period and message count.

const { periodFor } = require("./messageStats");

const BOM = "\uFEFF"; // lets Excel detect UTF-8, so Greek text shows correctly

function csvField(value) {
    const text = String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function nextDay(day) {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
}

// days: [{ day, count }] in date order. Every day from the first counted one to lastDay gets a
// row, days without messages as 0. Days before counting began are left out: they are unknown, not zero.
function buildActivityCsv({ days, periods, lastDay, outsideName }) {
    const counts = new Map(days.map((d) => [d.day, d.count]));
    const rows = [["Ημερομηνία", "Περίοδος", "Μηνύματα"]];
    if (days.length) {
        for (let day = days[0].day; day <= lastDay; day = nextDay(day)) {
            const period = periodFor(periods, day);
            rows.push([day, period ? period.name : outsideName, counts.get(day) ?? 0]);
        }
    }
    return BOM + rows.map((row) => row.map(csvField).join(",")).join("\r\n") + "\r\n";
}

module.exports = { buildActivityCsv, csvField };
