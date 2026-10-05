// Settings page (roles, channels, status, welcome).

const pages = require("../pages");
const session = require("../session");
const settings = require("../../lib/settings");
const { guildOptions, readSettingsForm } = require("../settingsForm");
const { EmbedBuilder } = require("discord.js");
const colors = require("../../lib/colors");
const { adminLog } = require("../../lib/adminLog");
const panelLog = require("../../lib/panelLog");
const { send, redirect, readForm, sameOrigin } = require("../http");
const access = require("../access");

module.exports = function settingsRoutes(ctx) {
    const { client, pool, origin, guild, withUser, staffRoles } = ctx;

    async function renderSettings(res, who, extra = {}, status = 200) {
        const g = await guild();
        await g.roles.fetch();
        await g.channels.fetch();
        return send(res, status, pages.settingsPage({ user: who.user, csrf: who.csrf, settings: (await settings.listSettings(pool)).filter((d) => d.group !== "welcome"), ...guildOptions(g), ...extra }));
    }

    // Like describeValue, but with names instead of mentions, for the panel's history.
    function plainValue(g, def, value) {
        if (value === null || value === undefined || value === "") return "κενό";
        const role = (id) => `@${g.roles.cache.get(id)?.name ?? id}`;
        if (def.type === "role") return role(value);
        if (def.type === "roles") return value.split(",").map(role).join(", ");
        if (def.type === "channel") return `#${g.channels.cache.get(value)?.name ?? value}`;
        if (def.type === "lines") return value.split("\n").join(" / ");
        return String(value);
    }

    function describeValue(g, def, value) {
        if (value === null || value === undefined || value === "") return "κενό";
        if (def.type === "role") return `<@&${value}>`;
        if (def.type === "roles") return value.split(",").map((id) => `<@&${id}>`).join(" ");
        if (def.type === "channel") return `<#${value}>`;
        if (def.type === "lines") return value.split("\n").map((l) => "`" + l.replace(/`/g, "'") + "`").join(" · ");
        return "`" + value.replace(/`/g, "'") + "`";
    }

    return {
        "GET /settings": async (req, res, ip, url) => withUser(req, res, (who) =>
            renderSettings(res, who, { saved: url.searchParams.get("saved") === "1" })),

        "POST /settings": async (req, res) => withUser(req, res, async (who) => {
            const form = await readForm(req, 32 * 1024);
            if (!sameOrigin(req, origin) || !session.safeEqual(form.get("csrf") || "", who.csrf)) {
                return send(res, 403, pages.messagePage("Μη έγκυρο αίτημα", "Ανανεώστε τη σελίδα και δοκιμάστε ξανά.", '<a class="button ghost" href="/settings">Ρυθμίσεις</a>'));
            }
            const g = await guild();
            await g.roles.fetch();
            await g.channels.fetch();
            const current = (await settings.listSettings(pool)).filter((d) => d.group !== "welcome");
            const { changes, errors } = readSettingsForm(form, current, g);
            if (!errors.length) {
                const after = { ...process.env };
                for (const c of changes) after[c.key] = c.value === null ? current.find((d) => d.key === c.key).envValue : c.value;
                if (!access.canUsePanel(who.member, staffRoles(after))) errors.push("Με αυτή την αλλαγή θα έχανες κι εσύ την πρόσβαση στον πίνακα. Πρόσθεσε τον ρόλο σου ή το ID σου στην Πρόσβαση στον πίνακα.");
            }
            if (errors.length) return renderSettings(res, who, { errors }, 400);

            for (const change of changes) await settings.setSetting(pool, change.key, change.value, who.user.id);
            if (changes.length) {
                const byKey = new Map(current.map((s) => [s.key, s]));
                const lines = changes.map((c) => {
                    const def = byKey.get(c.key);
                    const after = c.value === null ? `${describeValue(g, def, def.envValue)} (από .env)` : describeValue(g, def, c.value);
                    return `**${def.label}:** ${describeValue(g, def, def.value)} → ${after}`;
                });
                console.log(`Panel: ${who.user.id} changed ${changes.map((c) => c.key).join(", ")}`);
                for (const c of changes) {
                    const def = byKey.get(c.key);
                    const after = c.value === null ? `${plainValue(g, def, def.envValue)} (από .env)` : plainValue(g, def, c.value);
                    await panelLog.addEntry(pool, who.user.id, "Ρυθμίσεις", `${def.label}: ${plainValue(g, def, def.value)} → ${after}`);
                }
                await adminLog(client, new EmbedBuilder()
                    .setColor(colors.blue)
                    .setTitle("Αλλαγή ρυθμίσεων από τον πίνακα")
                    .setDescription([`**Από:** <@${who.user.id}>`, "", ...lines].join("\n")));
            }
            return redirect(res, "/settings?saved=1");
        }),
    };
};
