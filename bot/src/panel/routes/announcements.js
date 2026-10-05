// Announcements: write an embed, send it now or at a set time, edit it afterwards.

const pages = require("../pages");
const panelLog = require("../../lib/panelLog");
const ann = require("../../lib/announcements");
const { guildOptions } = require("../settingsForm");
const { renderDiscord } = require("../discordPreview");
const { PermissionFlagsBits: Perm } = require("discord.js");
const { send, redirect } = require("../http");

const BLANK = { id: null, channelId: null, messageId: null, title: "", description: "", color: "#F4A11C", footer: "", imageUrl: "", ping: "", sendAt: null, sentAt: null, lastError: null };

module.exports = function announcementRoutes(ctx) {
    const { client, pool, guild, withUser, checkedForm, names, formatWhen } = ctx;

    async function render(res, who, { edit = null, errors = [], done = null } = {}, status = 200) {
        const g = await guild();
        await g.roles.fetch();
        await g.channels.fetch();
        const { roles, channels } = guildOptions(g);
        const n = await names();
        const list = (await ann.listAnnouncements(pool)).map((a) => ({ ...a, channelName: a.channelId ? n.channels.get(a.channelId) : null, when: formatWhen(a.sentAt || a.sendAt) }));
        const view = edit ? { ...edit, descriptionHtml: renderDiscord(edit.description || "", n), sendAtLocal: ann.dateToAthensLocal(edit.sendAt) } : null;
        return send(res, status, pages.announcementsPage({ user: who.user, csrf: who.csrf, list, edit: view, roles, channels, errors, done }));
    }

    function readForm(form, existing) {
        const errors = [];
        const color = String(form.get("color") || "#F4A11C");
        const a = {
            ...(existing || BLANK),
            channelId: String(form.get("channelId") || "") || null,
            title: String(form.get("title") || "").trim().slice(0, 256),
            description: String(form.get("description") || "").replace(/\r\n/g, "\n").trim().slice(0, 4000),
            color: /^#[0-9a-fA-F]{6}$/.test(color) ? color.toUpperCase() : "#F4A11C",
            footer: String(form.get("footer") || "").trim().slice(0, 2048),
            imageUrl: String(form.get("imageUrl") || "").trim().slice(0, 500),
            ping: existing?.messageId ? existing.ping : String(form.get("ping") || ""),
        };
        if (!a.title && !a.description) errors.push("Γράψτε τίτλο ή κείμενο.");
        if (a.imageUrl && !/^https:\/\/[^\s"<>]{4,}$/.test(a.imageUrl)) errors.push("Η εικόνα πρέπει να είναι διεύθυνση https://.");
        if (a.ping && a.ping !== "everyone" && !/^\d{17,20}$/.test(a.ping)) errors.push("Μη έγκυρο ping.");
        return { a, errors };
    }

    return {
        "GET /announcements": async (req, res, ip, url) => withUser(req, res, async (who) => {
            const editParam = url.searchParams.get("edit");
            const edit = editParam === "new" ? { ...BLANK } : editParam ? await ann.getAnnouncement(pool, Number(editParam)) : null;
            const done = { sent: "Στάλθηκε.", scheduled: "Προγραμματίστηκε.", saved: "Αποθηκεύτηκε ως πρόχειρο.", updated: "Ενημερώθηκε στο Discord.", deleted: "Διαγράφηκε." }[url.searchParams.get("done")] ?? null;
            return render(res, who, { edit, done });
        }),

        "POST /announcements/save": async (req, res) => withUser(req, res, async (who) => {
            const form = await checkedForm(req, res, who, "/announcements", 128 * 1024);
            if (!form) return;
            const id = Number(form.get("id")) || null;
            const existing = id ? await ann.getAnnouncement(pool, id) : null;
            if (id && !existing) return redirect(res, "/announcements");
            const { a, errors } = readForm(form, existing);
            const action = form.get("action"); // draft | now | schedule | update
            const g = await guild();
            await g.channels.fetch();
            if (action !== "draft") {
                const channel = a.channelId ? g.channels.cache.get(a.channelId) : null;
                if (!channel) errors.push("Διαλέξτε κανάλι.");
                else if (g.members.me && !channel.permissionsFor(g.members.me)?.has([Perm.ViewChannel, Perm.SendMessages, Perm.EmbedLinks])) errors.push(`Το bot χρειάζεται View Channel, Send Messages και Embed Links στο #${channel.name}.`);
                if (a.ping === "everyone" && channel && g.members.me && !channel.permissionsFor(g.members.me)?.has(Perm.MentionEveryone)) errors.push("Το bot χρειάζεται το permission Mention Everyone για ping σε όλους.");
            }
            if (action === "schedule") {
                const when = ann.athensLocalToDate(form.get("sendAt"));
                if (!when) errors.push("Ορίστε ημερομηνία και ώρα.");
                else if (when.getTime() < Date.now() + 30 * 1000) errors.push("Η ώρα πρέπει να είναι στο μέλλον.");
                else a.sendAt = when;
            }
            if ((action === "now" || action === "schedule") && a.ping && form.get("confirm") !== "1") errors.push("Επιβεβαιώστε ότι θα γίνει ping, τσεκάροντας το κουτί.");
            if (errors.length) return render(res, who, { edit: a, errors }, 400);

            if (action === "draft") a.sendAt = null;
            a.id = await ann.saveAnnouncement(pool, a, who.user.id);
            const label = a.title || a.description.slice(0, 60);
            if (action === "now" || action === "update") {
                try {
                    await ann.sendAnnouncement(client, pool, a);
                } catch (err) {
                    return render(res, who, { edit: a, errors: [`Αποθηκεύτηκε, αλλά η αποστολή απέτυχε: ${err.message}`] }, 400);
                }
            }
            const verb = { now: "Στάλθηκε", update: "Ενημερώθηκε", schedule: `Προγραμματίστηκε για ${formatWhen(a.sendAt)}`, draft: "Πρόχειρο" }[action] || "Αποθηκεύτηκε";
            await panelLog.addEntry(pool, who.user.id, "Ανακοινώσεις", `${verb}: ${label}`);
            return redirect(res, `/announcements?done=${{ now: "sent", update: "updated", schedule: "scheduled" }[action] || "saved"}`);
        }),

        "POST /announcements/delete": async (req, res) => withUser(req, res, async (who) => {
            const form = await checkedForm(req, res, who, "/announcements");
            if (!form) return;
            const a = await ann.getAnnouncement(pool, Number(form.get("id")));
            if (a) {
                if (a.messageId && form.get("fromDiscord") === "1") {
                    try {
                        const channel = await client.channels.fetch(a.channelId);
                        await (await channel.messages.fetch(a.messageId)).delete();
                    } catch {
                        // Already gone.
                    }
                }
                await ann.deleteAnnouncement(pool, a.id);
                await panelLog.addEntry(pool, who.user.id, "Ανακοινώσεις", `Διαγράφηκε: ${a.title || a.description.slice(0, 60)}`);
            }
            return redirect(res, "/announcements?done=deleted");
        }),

        "POST /announcements/preview": async (req, res) => withUser(req, res, async (who) => {
            const form = await checkedForm(req, res, who, "/announcements");
            if (!form) return;
            const html = renderDiscord(String(form.get("text") ?? ""), await names());
            return send(res, 200, JSON.stringify({ html }), { "Content-Type": "application/json; charset=utf-8" });
        }),
    };
};
