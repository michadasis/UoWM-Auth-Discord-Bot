// Verified members and guests.

const pages = require("../pages");
const panelLog = require("../../lib/panelLog");
const { verifiedMembers, guestList, findMember } = require("../people");
const { removeVerification, AFFILIATION_LABELS } = require("../../lib/verification");
const { giveGuest, removeGuest } = require("../../lib/guests");
const { send, redirect } = require("../http");

module.exports = function peopleRoutes(ctx) {
    const { client, pool, guild, withUser, checkedForm, logChange } = ctx;

    return {
        "GET /members": async (req, res, ip, url) => withUser(req, res, async (who) => {
            const q = (url.searchParams.get("q") || "").slice(0, 100);
            const aff = ["student", "faculty", "staff"].includes(url.searchParams.get("aff")) ? url.searchParams.get("aff") : "";
            const view = await verifiedMembers(pool, await guild(), { q, aff, page: url.searchParams.get("page") });
            const done = url.searchParams.get("done");
            return send(res, 200, pages.membersPage({ user: who.user, csrf: who.csrf, view: { ...view, q, aff, done: done ? `Αφαιρέθηκε η επαλήθευση του ${done}.` : null } }));
        }),

        "POST /members/unverify": async (req, res) => withUser(req, res, async (who) => {
            const form = await checkedForm(req, res, who, "/members");
            if (!form) return;
            const id = String(form.get("id") || "");
            if (!/^\d{17,20}$/.test(id)) return redirect(res, "/members");
            const g = await guild();
            const member = await g.members.fetch(id).catch(() => null);
            const name = member ? member.displayName : id;
            const record = await removeVerification(g, id, `Panel: removed by ${who.user.id}`);
            if (record) {
                const label = AFFILIATION_LABELS[record.affiliation] ?? record.affiliation;
                await logChange(who, "Αφαίρεση επαλήθευσης", `<@${id}> (${label})`, `${name} (${label})`);
            }
            return redirect(res, `/members?done=${encodeURIComponent(name)}`);
        }),

        "GET /guests": async (req, res, ip, url) => withUser(req, res, async (who) => {
            const done = url.searchParams.get("done");
            return send(res, 200, pages.guestsPage({ user: who.user, csrf: who.csrf, guests: await guestList(pool, await guild()), done }));
        }),

        "POST /guests/give": async (req, res) => withUser(req, res, async (who) => {
            const form = await checkedForm(req, res, who, "/guests");
            if (!form) return;
            const g = await guild();
            const reason = String(form.get("reason") || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 300);
            const fail = async (error) => send(res, 400, pages.guestsPage({ user: who.user, csrf: who.csrf, guests: await guestList(pool, g), errors: [error], form: { who: form.get("who"), reason } }));
            if (!process.env.GUEST_ROLE_ID) return fail("Δεν έχει οριστεί ο ρόλος Προσωρινή άδεια στις Ρυθμίσεις.");
            if (!reason) return fail("Γράψτε μια αιτιολογία.");
            const found = await findMember(g, form.get("who"));
            if (found.error) return fail(found.error);
            const target = found.member;
            if (target.user.bot) return fail("Δεν δίνεται άδεια σε bot.");
            try {
                await giveGuest(g, target.id, reason, who.user.id);
            } catch (err) {
                console.error("Panel: giving guest role failed:", err.message);
                return fail("Δεν ήταν δυνατή η απόδοση του ρόλου. Ελέγξτε ότι ο ρόλος του bot είναι πάνω από την Προσωρινή άδεια.");
            }
            await panelLog.addEntry(pool, who.user.id, "Προσωρινές άδειες", `Δόθηκε στον ${target.displayName} (@${target.user.username}): ${reason}`);
            return redirect(res, `/guests?done=${encodeURIComponent(`Δόθηκε προσωρινή άδεια στον ${target.displayName}.`)}`);
        }),

        "POST /guests/remove": async (req, res) => withUser(req, res, async (who) => {
            const form = await checkedForm(req, res, who, "/guests");
            if (!form) return;
            const id = String(form.get("id") || "");
            if (!/^\d{17,20}$/.test(id)) return redirect(res, "/guests");
            const g = await guild();
            const member = await g.members.fetch(id).catch(() => null);
            const name = member ? member.displayName : id;
            const { found, problems } = await removeGuest(client, g, id, who.user.id);
            if (found) await panelLog.addEntry(pool, who.user.id, "Προσωρινές άδειες", `Αφαιρέθηκε από τον ${name}${problems.length ? ` (απέτυχε ${problems.join(" και ")})` : ""}`);
            return redirect(res, `/guests?done=${encodeURIComponent(found ? `Αφαιρέθηκε η προσωρινή άδεια του ${name}.` : "Το μέλος δεν είχε προσωρινή άδεια.")}`);
        }),
    };
};
