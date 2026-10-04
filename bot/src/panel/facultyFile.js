// The faculty list (data/faculty-emails.txt): read and written by the panel. The file is not in
// git, and the bot reads it on every verification, so a save applies at once.

const fs = require("fs/promises");
const path = require("path");
const { parseAddress } = require("../lib/emailPolicy");

async function readFacultyFile(file) {
    try {
        return await fs.readFile(file, "utf8");
    } catch (err) {
        if (err.code === "ENOENT") return "";
        throw err;
    }
}

// Returns { count, errors } for the text of the file.
function checkFacultyText(text, domain) {
    const errors = [];
    const seen = new Set();
    text.split(/\r?\n/).forEach((raw, i) => {
        const line = raw.replace(/#.*/, "").trim();
        if (!line) return;
        const local = parseAddress(line, domain);
        if (!local) errors.push(`Γραμμή ${i + 1}: το «${line.slice(0, 60)}» δεν είναι διεύθυνση @${domain}.`);
        else seen.add(local);
    });
    return { count: seen.size, errors };
}

// Writes through a temporary file, so a crash never leaves half a list.
async function writeFacultyFile(file, text) {
    const clean = text.replace(/\r\n/g, "\n").replace(/\n*$/, "\n");
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp-${process.pid}`;
    await fs.writeFile(tmp, clean, "utf8");
    await fs.rename(tmp, file);
}

module.exports = { readFacultyFile, checkFacultyText, writeFacultyFile };

// One entry per address in the file: { local, email, name, section }. The name is the comment
// after the address ("mvavva@uowm.gr # Βάββα Μαρία"); the section is the last full-line comment.
function parseFacultyEntries(text, domain) {
    const entries = [];
    let section = "";
    for (const raw of String(text).split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;
        if (line.startsWith("#")) { section = line.replace(/^#\s*/, ""); continue; }
        const [address, ...comment] = line.split("#");
        const local = parseAddress(address.trim(), domain);
        if (!local) continue;
        entries.push({ local, email: `${local}@${domain}`, name: comment.join("#").trim(), section });
    }
    return entries;
}

const PANEL_SECTION = "# Added from the admin panel.";

// Adds "email # name" at the end, under a heading for panel additions.
function addFacultyLine(text, email, name) {
    const lines = String(text).replace(/\r\n/g, "\n").replace(/\n*$/, "").split("\n").filter((l, i, all) => !(all.length === 1 && l === ""));
    if (!lines.includes(PANEL_SECTION)) lines.push(PANEL_SECTION);
    lines.push(name ? `${email} # ${name.replace(/[\r\n#]/g, " ").trim()}` : email);
    return lines.join("\n") + "\n";
}

// Removes the lines with that address; comments and other lines stay as they are.
function removeFacultyLine(text, local, domain) {
    return String(text).replace(/\r\n/g, "\n").split("\n").filter((raw) => {
        const line = raw.trim();
        if (!line || line.startsWith("#")) return true;
        return parseAddress(line.split("#")[0].trim(), domain) !== local;
    }).join("\n");
}

module.exports.parseFacultyEntries = parseFacultyEntries;
module.exports.addFacultyLine = addFacultyLine;
module.exports.removeFacultyLine = removeFacultyLine;
