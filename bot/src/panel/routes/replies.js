// Automatic replies.

const pages = require("../pages");
const { renderDiscord } = require("../discordPreview");
const panelLog = require("../../lib/panelLog");
const autoReplies = require("../../lib/autoReplies");
const { send, redirect } = require("../http");

module.exports = function repliesRoutes(ctx) {
    const { pool, withUser, names, checkedForm } = ctx;

    // The bot loads the rules on startup; the panel makes sure they are there too.
    let rulesLoaded = false;

    async function ensureRulesLoaded() {
        if (rulesLoaded) return;
        await autoReplies.loadAutoReplies(pool);
        rulesLoaded = true;
    }

    return {
        "GET /replies": async (req, res, ip, url) => withUser(req, res, async (who) => {
            await ensureRulesLoaded();
            const n = await names();
            const rules = autoReplies.getRules().map((r) => ({ ...r, previewHtml: renderDiscord(autoReplies.renderReply(r.reply), n) }));
            const editId = Number(url.searchParams.get("edit"));
            const edit = editId ? rules.find((r) => r.id === editId) ?? null : null;
            const testText = (url.searchParams.get("test") || "").slice(0, 500);
            let test = null;
            if (testText) {
                const rule = autoReplies.findRule(testText);
                test = { text: testText, rule, previewHtml: rule ? renderDiscord(autoReplies.renderReply(rule.reply), n) : "" };
            }
            const done = { saved: "Η απάντηση αποθηκεύτηκε.", deleted: "Η απάντηση διαγράφηκε." }[url.searchParams.get("done")] ?? null;
            return send(res, 200, pages.repliesPage({ user: who.user, csrf: who.csrf, rules, edit, test, done }));
        }),

        "POST /replies/save": async (req, res) => withUser(req, res, async (who) => {
            const form = await checkedForm(req, res, who, "/replies");
            if (!form) return;
            await ensureRulesLoaded();
            const id = Number(form.get("id")) || null;
            const rule = {
                id,
                name: String(form.get("name") || "").trim().slice(0, 100),
                triggers: String(form.get("triggers") || "").replace(/\r\n/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean).join("\n"),
                reply: String(form.get("reply") || "").replace(/\r\n/g, "\n").trim(),
                deleteAfter: Number(form.get("deleteAfter")),
                enabled: form.get("enabled") === "1",
            };
            const errors = [];
            if (!rule.name) errors.push("Δώστε ένα όνομα.");
            if (!autoReplies.parseTriggers(rule.triggers).length) errors.push("Γράψτε τουλάχιστον μία φράση στο «Πότε απαντά».");
            if (!rule.reply) errors.push("Γράψτε τι απαντά.");
            if (autoReplies.renderReply(rule.reply).length > 2000) errors.push("Η απάντηση ξεπερνά τους 2000 χαρακτήρες του Discord.");
            if (!Number.isInteger(rule.deleteAfter) || rule.deleteAfter < 0 || rule.deleteAfter > 3600) errors.push("Η διαγραφή πρέπει να είναι από 0 έως 3600 δευτερόλεπτα.");
            if (id && !autoReplies.getRules().some((r) => r.id === id)) errors.push("Η απάντηση δεν υπάρχει πια.");
            if (errors.length) {
                const n = await names();
                const rules = autoReplies.getRules().map((r) => ({ ...r, previewHtml: renderDiscord(autoReplies.renderReply(r.reply), n) }));
                return send(res, 400, pages.repliesPage({ user: who.user, csrf: who.csrf, rules, edit: rule, errors }));
            }
            await autoReplies.saveRule(pool, rule, who.user.id);
            await panelLog.addEntry(pool, who.user.id, "Αυτόματες απαντήσεις", `${id ? "Άλλαξε" : "Νέα"}: ${rule.name}${rule.enabled ? "" : " (ανενεργή)"}`);
            return redirect(res, "/replies?done=saved");
        }),

        // Live preview of a reply while typing.
        "POST /replies/preview": async (req, res) => withUser(req, res, async (who) => {
            const form = await checkedForm(req, res, who, "/replies");
            if (!form) return;
            const html = renderDiscord(autoReplies.renderReply(String(form.get("text") ?? "")), await names());
            return send(res, 200, JSON.stringify({ html }), { "Content-Type": "application/json; charset=utf-8" });
        }),

        "POST /replies/delete": async (req, res) => withUser(req, res, async (who) => {
            const form = await checkedForm(req, res, who, "/replies");
            if (!form) return;
            await ensureRulesLoaded();
            const id = Number(form.get("id"));
            const rule = autoReplies.getRules().find((r) => r.id === id);
            if (rule) {
                await autoReplies.deleteRule(pool, id);
                await panelLog.addEntry(pool, who.user.id, "Αυτόματες απαντήσεις", `Διαγράφηκε: ${rule.name}`);
            }
            return redirect(res, "/replies?done=deleted");
        }),
    };
};
