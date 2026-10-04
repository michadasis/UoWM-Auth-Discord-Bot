// Faculty list (data/faculty-emails.txt): a table with names and whether each address has been
// used to verify, add and remove buttons, and the whole file as text for bigger edits.

const pages = require("../pages");
const { loadEmailConfig } = require("../../lib/config");
const { identityHashFor } = require("../../lib/emailVerification");
const { readFacultyFile, checkFacultyText, writeFacultyFile, parseFacultyEntries, addFacultyLine, removeFacultyLine } = require("../facultyFile");
const { parseAddress } = require("../../lib/emailPolicy");
const { send, redirect } = require("../http");

module.exports = function facultyRoutes(ctx) {
    const { pool, withUser, checkedForm, logChange } = ctx;

    // Which addresses have verified: their hash is in users. Only yes or no is shown, never
    // which Discord account it is.
    async function verifiedLocals(config, entries) {
        if (!entries.length) return new Set();
        const byHash = new Map(entries.map((e) => [identityHashFor(config.uniIdHashSecret, `faculty:${e.local}`), e.local]));
        const rows = await pool.query(`SELECT uni_id_hash FROM users WHERE uni_id_hash IN (${[...byHash.keys()].map(() => "?").join(",")})`, [...byHash.keys()]).catch(() => []);
        return new Set(rows.map((r) => byHash.get(r.uni_id_hash)).filter(Boolean));
    }

    async function render(res, who, { text = null, errors = [], done = null, add = {} } = {}, status = 200) {
        const config = loadEmailConfig();
        const fileText = await readFacultyFile(config.facultyFile);
        const shown = text ?? fileText;
        const entries = parseFacultyEntries(fileText, config.domain);
        const verified = await verifiedLocals(config, entries);
        return send(res, status, pages.facultyPage({
            user: who.user, csrf: who.csrf, text: shown, domain: config.domain, count: checkFacultyText(shown, config.domain).count,
            entries: entries.map((e) => ({ ...e, verified: verified.has(e.local) })), errors, done, add,
        }));
    }

    return {
        "GET /faculty": async (req, res, ip, url) => withUser(req, res, (who) => {
            const done = { saved: "Αποθηκεύτηκε. Ισχύει από την επόμενη επαλήθευση.", added: "Προστέθηκε.", removed: "Αφαιρέθηκε. Όσοι έχουν ήδη επαληθευτεί κρατούν τον ρόλο τους." }[url.searchParams.get("done")] ?? null;
            return render(res, who, { done });
        }),

        "POST /faculty": async (req, res) => withUser(req, res, async (who) => {
            const form = await checkedForm(req, res, who, "/faculty", 256 * 1024);
            if (!form) return;
            const { facultyFile, domain } = loadEmailConfig();
            const text = String(form.get("text") ?? "");
            const { count, errors } = checkFacultyText(text, domain);
            if (errors.length) return render(res, who, { text, errors }, 400);
            const before = checkFacultyText(await readFacultyFile(facultyFile), domain).count;
            await writeFacultyFile(facultyFile, text);
            await logChange(who, "Λίστα καθηγητών", `Διευθύνσεις: ${before} → ${count}.`);
            return redirect(res, "/faculty?done=saved");
        }),

        "POST /faculty/add": async (req, res) => withUser(req, res, async (who) => {
            const form = await checkedForm(req, res, who, "/faculty");
            if (!form) return;
            const { facultyFile, domain } = loadEmailConfig();
            const input = String(form.get("email") || "").trim();
            const name = String(form.get("name") || "").trim().slice(0, 100);
            const local = parseAddress(input, domain);
            const text = await readFacultyFile(facultyFile);
            const add = { email: input, name };
            if (!local) return render(res, who, { errors: [`Το «${input.slice(0, 60)}» δεν είναι διεύθυνση @${domain}.`], add }, 400);
            if (parseFacultyEntries(text, domain).some((e) => e.local === local)) return render(res, who, { errors: [`Το ${local}@${domain} υπάρχει ήδη στη λίστα.`], add }, 400);
            await writeFacultyFile(facultyFile, addFacultyLine(text, `${local}@${domain}`, name));
            await logChange(who, "Λίστα καθηγητών", `Προστέθηκε: ${local}@${domain}${name ? ` (${name})` : ""}`);
            return redirect(res, "/faculty?done=added");
        }),

        "POST /faculty/remove": async (req, res) => withUser(req, res, async (who) => {
            const form = await checkedForm(req, res, who, "/faculty");
            if (!form) return;
            const { facultyFile, domain } = loadEmailConfig();
            const local = parseAddress(String(form.get("email") || ""), domain);
            const text = await readFacultyFile(facultyFile);
            const entry = parseFacultyEntries(text, domain).find((e) => e.local === local);
            if (entry) {
                await writeFacultyFile(facultyFile, removeFacultyLine(text, local, domain));
                await logChange(who, "Λίστα καθηγητών", `Αφαιρέθηκε: ${entry.email}${entry.name ? ` (${entry.name})` : ""}`);
            }
            return redirect(res, "/faculty?done=removed");
        }),
    };
};
