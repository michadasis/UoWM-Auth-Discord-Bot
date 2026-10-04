// Welcome message for new members: channel and text, with a preview. The values are settings
// (WELCOME_CHANNEL_ID, WELCOME_MESSAGE), so they override .env like the rest.

const pages = require("../pages");
const settings = require("../../lib/settings");
const panelLog = require("../../lib/panelLog");
const { renderWelcome } = require("../../lib/welcome");
const { guildOptions, readSettingsForm } = require("../settingsForm");
const { renderDiscord } = require("../discordPreview");
const { send, redirect } = require("../http");

const KEYS = ["WELCOME_CHANNEL_ID", "WELCOME_MESSAGE"];
const SAMPLE_MEMBER = "new-member";

module.exports = function welcomeRoutes(ctx) {
    const { pool, guild, withUser, checkedForm, names } = ctx;

    // The welcome as Discord would show it, for a made-up new member.
    async function previewHtml(env) {
        const n = await names();
        return renderDiscord(renderWelcome(SAMPLE_MEMBER, env), { ...n, users: new Map([[SAMPLE_MEMBER, "Νέο μέλος"]]) });
    }

    async function render(res, who, { errors = [], saved = false, form = null } = {}, status = 200) {
        const g = await guild();
        await g.channels.fetch();
        const defs = (await settings.listSettings(pool)).filter((d) => KEYS.includes(d.key));
        const values = form ?? Object.fromEntries(defs.map((d) => [d.key, d.value]));
        return send(res, status, pages.welcomePage({
            user: who.user, csrf: who.csrf, defs, values, channels: guildOptions(g).channels, errors, saved,
            previewHtml: await previewHtml({ ...process.env, ...values }),
        }));
    }

    return {
        "GET /welcome": async (req, res, ip, url) => withUser(req, res, (who) => render(res, who, { saved: url.searchParams.get("saved") === "1" })),

        "POST /welcome": async (req, res) => withUser(req, res, async (who) => {
            const form = await checkedForm(req, res, who, "/welcome");
            if (!form) return;
            const g = await guild();
            await g.channels.fetch();
            const current = (await settings.listSettings(pool)).filter((d) => KEYS.includes(d.key));
            const { changes, errors } = readSettingsForm(form, current, g);
            if (errors.length) {
                return render(res, who, { errors, form: { WELCOME_CHANNEL_ID: form.get("WELCOME_CHANNEL_ID") || "", WELCOME_MESSAGE: form.get("WELCOME_MESSAGE") || "" } }, 400);
            }
            for (const change of changes) {
                await settings.setSetting(pool, change.key, change.value, who.user.id);
                const label = current.find((d) => d.key === change.key).label;
                await panelLog.addEntry(pool, who.user.id, "Καλωσόρισμα", change.value === null ? `${label}: επαναφορά στο .env` : `${label}: ${change.key === "WELCOME_CHANNEL_ID" ? `#${g.channels.cache.get(change.value)?.name ?? (change.value || "κανένα")}` : change.value || "το προεπιλεγμένο"}`);
            }
            return redirect(res, "/welcome?saved=1");
        }),

        // Live preview while typing.
        "POST /welcome/preview": async (req, res) => withUser(req, res, async (who) => {
            const form = await checkedForm(req, res, who, "/welcome");
            if (!form) return;
            const html = await previewHtml({ ...process.env, WELCOME_MESSAGE: String(form.get("text") ?? "") });
            return send(res, 200, JSON.stringify({ html }), { "Content-Type": "application/json; charset=utf-8" });
        }),
    };
};
