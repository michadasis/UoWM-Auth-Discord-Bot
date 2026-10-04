// Role buttons.

const pages = require("../pages");
const { guildOptions } = require("../settingsForm");
const { renderDiscord } = require("../discordPreview");
const panelLog = require("../../lib/panelLog");
const roleMenus = require("../../lib/roleMenus");
const { PermissionFlagsBits: Perm } = require("discord.js");
const { send, redirect } = require("../http");

module.exports = function roleMenusRoutes(ctx) {
    const { client, pool, guild, withUser, names, checkedForm } = ctx;

    // Role menus: loaded once (the bot also loads them on startup) and the semester draft seeded.
    let menusLoaded = false;

    async function ensureMenusLoaded(g) {
        if (menusLoaded) return;
        await roleMenus.loadRoleMenus(pool);
        await g.emojis?.fetch?.().catch(() => null);
        await roleMenus.seedSemesterMenu(pool, g).catch((err) => console.error("Seeding the semester menu failed:", err.message));
        menusLoaded = true;
    }

    async function menuOptions(g) {
        await g.roles.fetch();
        await g.channels.fetch();
        const { roles, channels } = guildOptions(g);
        const emojis = g.emojis?.cache ? [...g.emojis.cache.values()].map((e) => ({ name: e.name, code: `<${e.animated ? "a" : ""}:${e.name}:${e.id}>` })).sort((a, b) => a.name.localeCompare(b.name)) : [];
        return { roles, channels, emojis };
    }

    async function renderMenus(res, who, { edit = null, errors = [], done = null } = {}, status = 200) {
        const g = await guild();
        await ensureMenusLoaded(g);
        const options = await menuOptions(g);
        const n = await names();
        const serverIconUrl = g.iconURL?.({ size: 64, extension: "png" }) ?? null;
        const withHtml = (m) => ({ ...m, descriptionHtml: renderDiscord(m.description || "", n), channelName: m.channelId ? n.channels.get(m.channelId) : null, footerIconSrc: roleMenus.footerIconUrl(m, serverIconUrl) });
        return send(res, status, pages.roleMenusPage({
            user: who.user, csrf: who.csrf, menus: roleMenus.getMenus().map(withHtml), edit: edit ? withHtml(edit) : null, options, errors, done,
        }));
    }

    // The menu from the form, checked. Returns { menu, errors }.
    function readMenuForm(form, g) {
        const errors = [];
        const id = Number(form.get("id")) || null;
        const existing = id ? roleMenus.getMenu(id) : null;
        if (id && !existing) errors.push("Το μήνυμα δεν υπάρχει πια.");
        const color = String(form.get("color") || "#F4A11C");
        const menu = {
            id,
            name: String(form.get("name") || "").trim().slice(0, 100),
            channelId: String(form.get("channelId") || "") || null,
            messageId: existing?.messageId ?? null,
            title: String(form.get("title") || "").trim().slice(0, 256),
            description: String(form.get("description") || "").replace(/\r\n/g, "\n").trim().slice(0, 4000),
            color: /^#[0-9a-fA-F]{6}$/.test(color) ? color.toUpperCase() : "#F4A11C",
            footer: String(form.get("footer") || "").trim().slice(0, 2048),
            footerIcon: "",
            buttons: [],
        };
        const iconMode = form.get("footerIconMode");
        const iconUrl = String(form.get("footerIconUrl") || "").trim();
        if (iconMode === "server") menu.footerIcon = "server";
        else if (iconMode === "url") {
            if (!/^https:\/\/[^\s"<>]{4,500}$/.test(iconUrl)) errors.push("Η εικόνα του footer πρέπει να είναι διεύθυνση https:// (έως 500 χαρακτήρες).");
            menu.footerIcon = iconUrl;
        }
        if (menu.footerIcon && !menu.footer) errors.push("Η εικόνα του footer χρειάζεται και κείμενο footer: το Discord δεν τη δείχνει μόνη της.");
        if (existing && existing.channelId && existing.channelId !== menu.channelId) menu.previousChannelId = existing.channelId;
        if (!menu.name) errors.push("Δώστε ένα όνομα.");
        if (!menu.title && !menu.description) errors.push("Γράψτε τίτλο ή κείμενο.");
        const pos = form.getAll("btn_pos");
        const rolesIn = form.getAll("btn_role");
        const labels = form.getAll("btn_label");
        const emojis = form.getAll("btn_emoji");
        const emojiTexts = form.getAll("btn_emoji_text");
        const styles = form.getAll("btn_style");
        const rows = [];
        rolesIn.forEach((roleId, i) => {
            if (!roleId) return;
            const role = g.roles.cache.get(roleId);
            const name = role?.name ?? roleId;
            if (!roleMenus.assignable(g, roleId)) errors.push(`Το bot δεν μπορεί να δίνει τον ρόλο @${name}: δεν υπάρχει, ανήκει σε bot, ή είναι πάνω από τον ρόλο του bot.`);
            const emoji = (emojiTexts[i] || "").trim() || emojis[i] || "";
            if (emoji && !/^<a?:[\w~]{1,32}:\d{17,20}>$/.test(emoji) && [...emoji].length > 8) errors.push(`Το emoji του κουμπιού @${name} δεν είναι έγκυρο.`);
            rows.push({ pos: Number(pos[i]) || i + 1, i, roleId, label: (labels[i] || "").trim().slice(0, 80) || name, emoji, style: Object.keys(roleMenus.STYLES).includes(styles[i]) ? styles[i] : "primary" });
        });
        rows.sort((a, b) => a.pos - b.pos || a.i - b.i);
        const seen = new Set();
        for (const r of rows) {
            if (seen.has(r.roleId)) { errors.push(`Ο ρόλος @${g.roles.cache.get(r.roleId)?.name ?? r.roleId} υπάρχει δύο φορές.`); continue; }
            seen.add(r.roleId);
            menu.buttons.push({ roleId: r.roleId, label: r.label, emoji: r.emoji, style: r.style });
        }
        if (menu.buttons.length > roleMenus.MAX_BUTTONS) errors.push(`Έως ${roleMenus.MAX_BUTTONS} κουμπιά σε κάθε μήνυμα.`);
        return { menu, errors };
    }

    return {
        "GET /role-menus": async (req, res, ip, url) => withUser(req, res, async (who) => {
            const g = await guild();
            await ensureMenusLoaded(g);
            const editParam = url.searchParams.get("edit");
            const blank = { id: null, name: "", channelId: null, messageId: null, title: "", description: "", color: "#F4A11C", footer: "", buttons: [] };
            const edit = editParam === "new" ? blank : editParam ? roleMenus.getMenu(editParam) : null;
            const done = { saved: "Αποθηκεύτηκε.", published: "Αποθηκεύτηκε και δημοσιεύτηκε στο Discord.", deleted: "Διαγράφηκε." }[url.searchParams.get("done")] ?? null;
            return renderMenus(res, who, { edit, done });
        }),

        "POST /role-menus/save": async (req, res) => withUser(req, res, async (who) => {
            const form = await checkedForm(req, res, who, "/role-menus", 128 * 1024);
            if (!form) return;
            const g = await guild();
            await ensureMenusLoaded(g);
            await g.roles.fetch();
            await g.channels.fetch();
            const { menu, errors } = readMenuForm(form, g);
            const publish = form.get("action") === "publish";
            if (publish) {
                const channel = menu.channelId ? g.channels.cache.get(menu.channelId) : null;
                if (!channel) errors.push("Διαλέξτε το κανάλι όπου θα δημοσιευτεί.");
                else if (g.members.me && !channel.permissionsFor(g.members.me)?.has([Perm.ViewChannel, Perm.SendMessages, Perm.EmbedLinks])) {
                    errors.push(`Το bot χρειάζεται View Channel, Send Messages και Embed Links στο #${channel.name}.`);
                }
                if (!menu.buttons.length) errors.push("Προσθέστε τουλάχιστον ένα κουμπί.");
            }
            if (errors.length) return renderMenus(res, who, { edit: menu, errors }, 400);

            // Moved to another channel: the old message goes, the next publish posts a new one.
            if (menu.previousChannelId && menu.messageId) {
                await roleMenus.unpublishMenu(client, { channelId: menu.previousChannelId, messageId: menu.messageId });
                menu.messageId = null;
            }
            let saved = await roleMenus.saveMenu(pool, menu, who.user.id);
            if (publish) {
                try {
                    saved = await roleMenus.publishMenu(client, pool, saved, menu.channelId, who.user.id);
                } catch (err) {
                    console.error("Publishing role menu failed:", err.message);
                    return renderMenus(res, who, { edit: saved, errors: [`Αποθηκεύτηκε, αλλά η δημοσίευση απέτυχε: ${err.message}`] }, 400);
                }
            }
            await panelLog.addEntry(pool, who.user.id, "Κουμπιά ρόλων", `${publish ? "Δημοσιεύτηκε" : "Αποθηκεύτηκε"}: ${saved.name} (${saved.buttons.length} κουμπιά)`);
            return redirect(res, `/role-menus?done=${publish ? "published" : "saved"}`);
        }),

        // Live preview of the text while typing.
        "POST /role-menus/preview": async (req, res) => withUser(req, res, async (who) => {
            const form = await checkedForm(req, res, who, "/role-menus");
            if (!form) return;
            const html = renderDiscord(String(form.get("text") ?? ""), await names());
            return send(res, 200, JSON.stringify({ html }), { "Content-Type": "application/json; charset=utf-8" });
        }),

        "POST /role-menus/delete": async (req, res) => withUser(req, res, async (who) => {
            const form = await checkedForm(req, res, who, "/role-menus");
            if (!form) return;
            const g = await guild();
            await ensureMenusLoaded(g);
            const menu = roleMenus.getMenu(form.get("id"));
            if (menu) {
                await roleMenus.unpublishMenu(client, menu);
                await roleMenus.deleteMenu(pool, menu.id);
                await panelLog.addEntry(pool, who.user.id, "Κουμπιά ρόλων", `Διαγράφηκε: ${menu.name}`);
            }
            return redirect(res, "/role-menus?done=deleted");
        }),
    };
};
