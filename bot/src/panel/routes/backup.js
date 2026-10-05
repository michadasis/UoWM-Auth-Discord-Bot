// Backup and restore of what the panel manages.

const pages = require("../pages");
const panelLog = require("../../lib/panelLog");
const { exportAll, checkBackup, restoreAll } = require("../../lib/backup");
const { loadEmailConfig } = require("../../lib/config");
const { readFacultyFile, writeFacultyFile, checkFacultyText } = require("../facultyFile");
const fs = require("fs");
const { PermissionFlagsBits } = require("discord.js");
const dbBackup = require("../../lib/dbBackup");
const { send, redirect, SECURITY_HEADERS } = require("../http");

// Database backups hold every verification record, so only the owner and Administrators.
const canManageDb = (member) => member.id === member.guild.ownerId || Boolean(member.permissions?.has?.(PermissionFlagsBits.Administrator));

module.exports = function backupRoutes(ctx) {
    const { pool, withUser, checkedForm } = ctx;

    return {
        "GET /backup": async (req, res, ip, url) => withUser(req, res, async (who) => {
            const done = url.searchParams.get("done");
            const db = canManageDb(who.member) ? { backups: await dbBackup.listBackups().catch(() => []), dir: dbBackup.backupDir(), keep: dbBackup.keepCount() } : null;
            return send(res, 200, pages.backupPage({ user: who.user, csrf: who.csrf, done: done ? decodeURIComponent(done) : null, db }));
        }),

        "GET /backup/db": async (req, res, ip, url) => withUser(req, res, async (who) => {
            const file = dbBackup.backupPath(url.searchParams.get("name"));
            if (!canManageDb(who.member) || !file || !fs.existsSync(file)) return send(res, 404, pages.notFoundPage());
            await panelLog.addEntry(pool, who.user.id, "Αντίγραφο βάσης", `Λήψη ${url.searchParams.get("name")}`);
            res.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": "application/gzip", "Content-Disposition": `attachment; filename="${url.searchParams.get("name")}"` });
            return fs.createReadStream(file).pipe(res);
        }),

        "POST /backup/db/create": async (req, res) => withUser(req, res, async (who) => {
            const form = await checkedForm(req, res, who, "/backup");
            if (!form) return;
            if (!canManageDb(who.member)) return send(res, 403, pages.forbiddenPage());
            const result = await dbBackup.createBackup(pool);
            const rows = Object.values(result.tables).reduce((a, b) => a + b, 0);
            await panelLog.addEntry(pool, who.user.id, "Αντίγραφο βάσης", `Δημιουργήθηκε ${result.name} (${rows} γραμμές)`);
            return redirect(res, `/backup?done=${encodeURIComponent(`Δημιουργήθηκε αντίγραφο της βάσης (${rows} γραμμές).`)}`);
        }),

        "GET /backup.json": async (req, res) => withUser(req, res, async (who) => {
            const { facultyFile } = loadEmailConfig();
            const data = await exportAll(pool, { facultyText: await readFacultyFile(facultyFile).catch(() => null) });
            await panelLog.addEntry(pool, who.user.id, "Αντίγραφο ασφαλείας", "Λήψη αντιγράφου");
            const name = `panel-backup-${data.exportedAt.slice(0, 10)}.json`;
            return send(res, 200, JSON.stringify(data, null, 2), { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` });
        }),

        "POST /backup/restore": async (req, res) => withUser(req, res, async (who) => {
            const form = await checkedForm(req, res, who, "/backup", 2 * 1024 * 1024);
            if (!form) return;
            const raw = String(form.get("data") || "");
            let data = null;
            let errors = [];
            try {
                data = JSON.parse(raw);
            } catch {
                errors = ["Το κείμενο δεν είναι έγκυρο JSON."];
            }
            if (data) errors = checkBackup(data);
            const { facultyFile, domain } = loadEmailConfig();
            if (!errors.length && typeof data.faculty === "string" && data.faculty.trim()) errors.push(...checkFacultyText(data.faculty, domain).errors.map((e) => `Λίστα καθηγητών: ${e}`));
            if (!errors.length && form.get("confirm") !== "1") errors.push("Επιβεβαιώστε την επαναφορά τσεκάροντας το κουτί.");
            if (errors.length) return send(res, 400, pages.backupPage({ user: who.user, csrf: who.csrf, errors, data: raw }));
            const counts = await restoreAll(pool, data, who.user.id, { writeFaculty: (text) => writeFacultyFile(facultyFile, text) });
            const summary = `${counts.settings} ρυθμίσεις, ${counts.texts} κείμενα, ${counts.autoReplies} απαντήσεις, ${counts.roleMenus} μηνύματα με κουμπιά${counts.faculty ? ", η λίστα καθηγητών" : ""}`;
            await panelLog.addEntry(pool, who.user.id, "Αντίγραφο ασφαλείας", `Επαναφορά από αντίγραφο της ${String(data.exportedAt || "").slice(0, 10)}: ${summary}`);
            return redirect(res, `/backup?done=${encodeURIComponent(`Έγινε επαναφορά: ${summary}. Τα δημοσιευμένα μηνύματα με κουμπιά ενημερώνονται στο Discord όταν τα ξαναδημοσιεύσετε.`)}`);
        }),
    };
};
