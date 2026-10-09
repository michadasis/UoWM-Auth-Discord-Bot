// Verify message editor, periods and faculty list.

const pages = require("../pages");
const texts = require("../../lib/texts");
const { PLACEHOLDERS, MAX_LENGTH, renderTemplate, toTemplate, checkTemplate } = require("../../lib/verifyTemplate");
const { fileText, setNextMode } = require("../../lib/verifyInfoMessage");
const { periodEntries } = require("../../lib/activityData");
const { expandPeriods, dayKey, formatDay } = require("../../lib/messageStats");
const { renderDiscord } = require("../discordPreview");
const { toLines, fromLines } = require("../periodLines");
const { SECURITY_HEADERS, send, redirect } = require("../http");

module.exports = function textsRoutes(ctx) {
    const { pool, withUser, names, checkedForm, logChange } = ctx;

    async function renderVerifyText(res, who, { template, errors = [], saved = false, previewed = false }, status = 200) {
        const fromPanel = texts.getText("verify_info") !== null;
        const current = template ?? (fromPanel ? texts.getText("verify_info") : toTemplate(fileText()));
        const n = await names();
        const message = renderTemplate(current);
        return send(res, status, pages.verifyTextPage({
            user: who.user, csrf: who.csrf, template: current, previewHtml: renderDiscord(message, n),
            length: message.length, maxLength: MAX_LENGTH, fromPanel,
            placeholders: PLACEHOLDERS.map(([name, key]) => [name, process.env[key] ? n.roles.get(process.env[key]) : null]),
            errors, saved, previewed,
        }));
    }

    const KIND_LABEL = { yearly: "κάθε χρόνο", easter: "Πάσχα", dated: "μία φορά" };

    // The periods of the current academic year (September to August), one row each.
    function academicYearRows(entries) {
        const today = dayKey(new Date());
        const year = Number(today.slice(0, 4));
        const start = Number(today.slice(5, 7)) >= 9 ? year : year - 1;
        const from = `${start}-09-01`;
        const to = `${start + 1}-08-31`;
        const rows = [];
        for (const entry of entries) {
            for (const p of expandPeriods([entry], start, start + 1)) {
                if (p.start >= from && p.start <= to) rows.push({ name: p.name, start: formatDay(p.start), end: formatDay(p.end), type: KIND_LABEL[entry.kind], sort: p.start });
            }
        }
        return rows.sort((a, b) => a.sort.localeCompare(b.sort));
    }

    async function renderPeriods(res, who, { lines, entries, errors = [], saved = false, previewed = false }, status = 200) {
        const fromPanel = texts.getText("periods") !== null;
        let current = entries;
        if (!current) {
            try {
                current = await periodEntries();
            } catch (err) {
                current = [];
                errors = [...errors, `Το αρχείο περιόδων δεν διαβάζεται: ${err.message}`];
            }
        }
        return send(res, status, pages.periodsPage({
            user: who.user, csrf: who.csrf, lines: lines ?? toLines(current), rows: academicYearRows(current), fromPanel, errors, saved, previewed,
        }));
    }

    return {
        "GET /verify-text": async (req, res, ip, url) => withUser(req, res, (who) =>
            renderVerifyText(res, who, { saved: url.searchParams.get("saved") === "1" })),

        "POST /verify-text": async (req, res) => withUser(req, res, async (who) => {
            const form = await checkedForm(req, res, who, "/verify-text");
            if (!form) return;
            const action = form.get("action");
            // "ping": new message with pings; "edit" (the default): edit the posted message, no ping.
            const mode = form.get("update") === "ping" ? "ping" : "edit";
            const how = mode === "ping" ? "νέο μήνυμα με ping" : "επεξεργασία χωρίς ping";
            if (action === "reset") {
                if (texts.getText("verify_info") !== null) {
                    setNextMode(mode);
                    await texts.setText(pool, "verify_info", null, who.user.id);
                    await logChange(who, "Μήνυμα επαλήθευσης", `Επαναφορά στο privacyNotice.js (${how}).`);
                }
                return redirect(res, "/verify-text?saved=1");
            }
            const template = String(form.get("template") ?? "").replace(/\r\n/g, "\n").replace(/\s+$/, "");
            if (action === "preview") return renderVerifyText(res, who, { template, previewed: true });
            const errors = checkTemplate(template);
            const before = texts.getText("verify_info") ?? toTemplate(fileText());
            if (errors.length) return renderVerifyText(res, who, { template, errors }, 400);
            if (template !== before || texts.getText("verify_info") === null) {
                setNextMode(mode);
                await texts.setText(pool, "verify_info", template, who.user.id);
                await logChange(who, "Μήνυμα επαλήθευσης", `Το κείμενο άλλαξε (${renderTemplate(template).length} χαρακτήρες, ${how}).`);
            }
            return redirect(res, "/verify-text?saved=1");
        }),

        // Live preview while typing (the page's script calls this); same rendering as the button.
        "POST /verify-text/preview": async (req, res) => withUser(req, res, async (who) => {
            const form = await checkedForm(req, res, who, "/verify-text");
            if (!form) return;
            const message = renderTemplate(String(form.get("template") ?? "").replace(/\r\n/g, "\n"));
            res.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8" });
            return res.end(JSON.stringify({ html: renderDiscord(message, await names()), length: message.length, maxLength: MAX_LENGTH }));
        }),

        "GET /periods": async (req, res, ip, url) => withUser(req, res, (who) =>
            renderPeriods(res, who, { saved: url.searchParams.get("saved") === "1" })),

        "POST /periods": async (req, res) => withUser(req, res, async (who) => {
            const form = await checkedForm(req, res, who, "/periods");
            if (!form) return;
            const action = form.get("action");
            if (action === "reset") {
                if (texts.getText("periods") !== null) {
                    await texts.setText(pool, "periods", null, who.user.id);
                    await logChange(who, "Περίοδοι", "Επαναφορά στο data/periods.json.");
                }
                return redirect(res, "/periods?saved=1");
            }
            const lines = String(form.get("lines") ?? "").replace(/\r\n/g, "\n");
            const { entries, json, errors } = fromLines(lines);
            if (errors.length) return renderPeriods(res, who, { lines, entries: [], errors }, 400);
            if (action === "preview") return renderPeriods(res, who, { lines, entries, previewed: true });
            await texts.setText(pool, "periods", json, who.user.id);
            await logChange(who, "Περίοδοι", `Αποθηκεύτηκαν ${entries.length} περίοδοι.`);
            return redirect(res, "/periods?saved=1");
        }),
    };
};
