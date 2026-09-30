// The periods as simple lines for the editor, one per period:
//   Χειμερινό εξάμηνο | 09-28 | 01-08         every year (MM-DD)
//   Διακοπές Πάσχα | easter-6 | easter+7      days from Orthodox Easter Sunday, every year
//   Κατάληψη | 2026-11-02 | 2026-11-06        once (YYYY-MM-DD)

const { parsePeriods } = require("../lib/messageStats");

function toLines(entries) {
    return entries.map((e) => e.kind === "easter"
        ? `${e.name} | easter${e.from < 0 ? e.from : `+${e.from}`} | easter${e.to < 0 ? e.to : `+${e.to}`}`
        : `${e.name} | ${e.start} | ${e.end}`).join("\n");
}

// Returns { entries, json, errors }. json is what gets stored (same format as data/periods.json).
function fromLines(text) {
    const raw = [];
    const errors = [];
    text.split(/\r?\n/).forEach((line, i) => {
        if (!line.trim() || line.trim().startsWith("#")) return;
        const parts = line.split("|").map((p) => p.trim());
        if (parts.length !== 3 || !parts[0]) return errors.push(`Γραμμή ${i + 1}: χρειάζεται «όνομα | αρχή | τέλος».`);
        const [name, start, end] = parts;
        const easter = /^easter([+-]\d{1,3})$/i;
        if (easter.test(start) || easter.test(end)) {
            if (!easter.test(start) || !easter.test(end)) return errors.push(`Γραμμή ${i + 1}: και η αρχή και το τέλος πρέπει να είναι easter±ημέρες.`);
            return raw.push({ name, easter: { from: Number(start.match(easter)[1]), to: Number(end.match(easter)[1]) } });
        }
        raw.push({ name, start, end });
    });
    if (!raw.length && !errors.length) errors.push("Δεν υπάρχει καμία περίοδος.");
    let entries = [];
    if (!errors.length) {
        try {
            entries = parsePeriods(JSON.stringify(raw));
        } catch (err) {
            errors.push(`Μη έγκυρη περίοδος: ${err.message}.`);
        }
    }
    return { entries, json: JSON.stringify(raw, null, 4), errors };
}

module.exports = { toLines, fromLines };
