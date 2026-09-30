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
