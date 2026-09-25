// Decides who may verify, and as what, from the institutional address alone.
//
// classifyAddress -> { ok: true, local, affiliation: 'student' | 'faculty', identityKey }
//                 or { ok: false, reason: 'invalid_address' | 'wrong_department' | 'not_eligible' }

const fs = require("fs/promises");

const LOCAL_PART = /^[a-z0-9][a-z0-9._-]{1,63}$/;

// Accepts "cs01234" or "cs01234@uowm.gr", any case, surrounding spaces.
function parseAddress(input, domain) {
    if (typeof input !== "string") return null;
    const value = input.trim().toLowerCase();
    const at = value.lastIndexOf("@");
    const local = at === -1 ? value : value.slice(0, at);
    if (at !== -1 && value.slice(at + 1) !== domain) return null;
    return LOCAL_PART.test(local) ? local : null;
}

function classifyAddress(input, config, facultyLocals) {
    const local = parseAddress(input, config.domain);
    if (!local) return { ok: false, reason: "invalid_address" };

    if (facultyLocals.has(local)) return { ok: true, local, affiliation: "faculty", identityKey: `faculty:${local}` };

    const student = local.match(config.studentPattern);
    if (student) {
        // Keyed on the student number so that aliases of the same account count once.
        return { ok: true, local, affiliation: "student", identityKey: `student:${student[1] ?? local}` };
    }

    if (config.otherStudentPattern.test(local)) return { ok: false, reason: "wrong_department" };
    return { ok: false, reason: "not_eligible" };
}

// Reads the faculty list on every call so edits apply without a restart.
// Lines: full addresses or usernames; "#" starts a comment.
async function loadFacultyLocals(file, domain) {
    let text;
    try {
        text = await fs.readFile(file, "utf8");
    } catch (err) {
        if (err.code === "ENOENT") return new Set();
        throw err;
    }
    return new Set(
        text
            .split(/\r?\n/)
            .map((line) => line.replace(/#.*/, "").trim())
            .filter(Boolean)
            .map((line) => parseAddress(line, domain))
            .filter(Boolean),
    );
}

function maskAddress(local, domain) {
    const visible = local.length <= 4 ? local.slice(0, 1) : local.slice(0, 3);
    return `${visible}${"*".repeat(Math.max(local.length - visible.length - 1, 1))}${local.slice(-1)}@${domain}`;
}

module.exports = { parseAddress, classifyAddress, loadFacultyLocals, maskAddress };
