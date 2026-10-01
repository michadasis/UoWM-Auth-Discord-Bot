// Checks shown on the panel's home page: things that would silently break the bot, each with a
// link to where it is fixed. status: "ok", "warn" or "err".

const fs = require("fs");
const crypto = require("crypto");
const { PermissionFlagsBits } = require("discord.js");
const { getMeta } = require("../lib/messageStats");

const DAY = 86400000;

function certificateCheck(certFile, now = Date.now()) {
    if (!certFile) return null;
    try {
        const cert = new crypto.X509Certificate(fs.readFileSync(certFile));
        const days = Math.floor((Date.parse(cert.validTo) - now) / DAY);
        if (days < 0) return { status: "err", text: "Το πιστοποιητικό HTTPS έχει λήξει. Αντιγράψτε το ανανεωμένο από το DirectAdmin στο certs/." };
        if (days <= 21) return { status: days <= 7 ? "err" : "warn", text: `Το πιστοποιητικό HTTPS λήγει σε ${days} ημέρες. Αντιγράψτε το ανανεωμένο από το DirectAdmin στο certs/.` };
        return { status: "ok", text: `Πιστοποιητικό HTTPS σε ισχύ για ${days} ημέρες ακόμα.` };
    } catch (err) {
        return { status: "warn", text: `Το πιστοποιητικό δεν διαβάζεται: ${err.message}` };
    }
}

// guild: live guild with members.me. env: settings (process.env).
async function healthChecks({ guild, pool, certFile, env = process.env }) {
    const checks = [];
    const me = guild.members.me;
    const roleName = (id) => guild.roles.cache.get(id)?.name;

    if (me && !me.permissions.has(PermissionFlagsBits.ManageRoles)) {
        checks.push({ status: "err", text: "Το bot δεν έχει το permission Manage Roles, οπότε δεν μπορεί να δίνει ρόλους.", href: null });
    }

    const assigned = [
        ["Φοιτητής", env.STUDENT_ROLE_ID],
        ["Καθηγητής", env.PROFESSOR_ROLE_ID],
        ["Προσωπικό", env.STAFF_ROLE_ID],
        ["Προσωρινή άδεια", env.GUEST_ROLE_ID],
    ];
    if (!env.STUDENT_ROLE_ID) checks.push({ status: "err", text: "Δεν έχει οριστεί ο ρόλος Φοιτητής.", href: "/settings" });
    const top = me?.roles.highest.position ?? Infinity;
    const tooHigh = [...assigned.filter(([, id]) => id), ...String(env.SEMESTER_ROLE_IDS || "").split(",").filter(Boolean).map((id) => [roleName(id) ?? id, id])]
        .filter(([, id]) => (guild.roles.cache.get(id)?.position ?? -1) >= top)
        .map(([label]) => label);
    if (tooHigh.length) checks.push({ status: "err", text: `Ο ρόλος του bot είναι κάτω από: ${tooHigh.join(", ")}. Μετακινήστε τον πιο πάνω στις ρυθμίσεις ρόλων του server.`, href: null });
    const missing = assigned.filter(([, id]) => id && !guild.roles.cache.has(id)).map(([label]) => label);
    if (missing.length) checks.push({ status: "err", text: `Ο ρόλος δεν υπάρχει πια στον server: ${missing.join(", ")}.`, href: "/settings" });

    if (!env.ADMIN_CHANNEL_ID) checks.push({ status: "warn", text: "Δεν έχει οριστεί κανάλι καταγραφής, οπότε οι αλλαγές δεν καταγράφονται στο Discord.", href: "/settings" });
    if (!env.SEMESTER_CHANNEL_ID) checks.push({ status: "warn", text: "Δεν έχει οριστεί κανάλι επιλογής εξαμήνων, οπότε οι νέοι φοιτητές δεν παίρνουν ping.", href: "/settings" });

    if (pool && !(await getMeta(pool, "verify_info_message").catch(() => null))) {
        checks.push({ status: "warn", text: "Το bot δεν ξέρει το μήνυμα του #επαλήθευση. Τρέξτε /post-verify-info εκεί, για να ενημερώνεται αυτόματα.", href: null });
    }

    const cert = certificateCheck(certFile);
    if (cert) checks.push({ ...cert, href: null });

    if (!checks.some((c) => c.status !== "ok")) checks.unshift({ status: "ok", text: "Όλα δείχνουν εντάξει.", href: null });
    return checks;
}

module.exports = { healthChecks, certificateCheck };
