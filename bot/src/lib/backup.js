// Backup of what the admin panel manages: settings, texts, automatic replies, role buttons and the
// faculty list. Restoring merges: settings and texts present in the file are set, replies and role
// button messages are matched by name (updated if they exist, added if not), and nothing else is
// removed. Published role button messages keep their Discord message.

const settings = require("./settings");
const texts = require("./texts");
const autoReplies = require("./autoReplies");
const roleMenus = require("./roleMenus");

const VERSION = 1;

async function exportAll(pool, { facultyText = null } = {}) {
    await roleMenus.loadRoleMenus(pool);
    await autoReplies.loadAutoReplies(pool);
    const stored = (await pool.query("SELECT setting_key, setting_value FROM settings")).filter((r) => settings.DEFINITIONS.some((d) => d.key === r.setting_key));
    const textRows = await pool.query("SELECT text_key, content FROM texts").catch(() => []);
    return {
        format: "uowm-auth-panel-backup",
        version: VERSION,
        exportedAt: new Date().toISOString(),
        settings: Object.fromEntries(stored.map((r) => [r.setting_key, r.setting_value])),
        texts: Object.fromEntries(textRows.map((r) => [r.text_key, r.content])),
        autoReplies: autoReplies.getRules().map((r) => ({ name: r.name, triggers: r.triggers, reply: r.reply, deleteAfter: r.deleteAfter, enabled: r.enabled, channelIds: r.channelIds, cooldown: r.cooldown })),
        roleMenus: roleMenus.getMenus().map((m) => ({ name: m.name, channelId: m.channelId, title: m.title, description: m.description, color: m.color, footer: m.footer, footerIcon: m.footerIcon, buttons: m.buttons })),
        faculty: facultyText,
    };
}

const isObject = (v) => v && typeof v === "object" && !Array.isArray(v);

// Checks a parsed backup. Returns a list of problems (empty when it can be restored).
function checkBackup(data) {
    const problems = [];
    if (!isObject(data) || data.format !== "uowm-auth-panel-backup") return ["Δεν είναι αντίγραφο του πίνακα."];
    if (data.version !== VERSION) problems.push(`Άγνωστη έκδοση αντιγράφου (${data.version}).`);
    if (data.settings !== undefined && !isObject(data.settings)) problems.push("Οι ρυθμίσεις δεν έχουν τη σωστή μορφή.");
    if (data.texts !== undefined && !isObject(data.texts)) problems.push("Τα κείμενα δεν έχουν τη σωστή μορφή.");
    for (const [key, list] of [["autoReplies", data.autoReplies], ["roleMenus", data.roleMenus]]) {
        if (list !== undefined && (!Array.isArray(list) || list.some((x) => !isObject(x) || typeof x.name !== "string" || !x.name.trim()))) problems.push(`Η ενότητα ${key} δεν έχει τη σωστή μορφή.`);
    }
    if (data.faculty !== undefined && data.faculty !== null && typeof data.faculty !== "string") problems.push("Η λίστα καθηγητών δεν έχει τη σωστή μορφή.");
    return problems;
}

// Restores a checked backup. writeFaculty(text) saves the faculty list. Returns counts.
async function restoreAll(pool, data, userId, { writeFaculty = null } = {}) {
    const counts = { settings: 0, texts: 0, autoReplies: 0, roleMenus: 0, faculty: false };
    for (const [key, value] of Object.entries(data.settings || {})) {
        if (!settings.DEFINITIONS.some((d) => d.key === key) || typeof value !== "string") continue;
        await settings.setSetting(pool, key, value, userId);
        counts.settings++;
    }
    for (const [key, value] of Object.entries(data.texts || {})) {
        if (!["verify_info", "periods"].includes(key) || typeof value !== "string") continue;
        await texts.setText(pool, key, value, userId);
        counts.texts++;
    }
    await autoReplies.loadAutoReplies(pool);
    for (const r of data.autoReplies || []) {
        const existing = autoReplies.getRules().find((x) => x.name === r.name);
        await autoReplies.saveRule(pool, {
            id: existing?.id ?? null, name: String(r.name).slice(0, 100), triggers: String(r.triggers || ""), reply: String(r.reply || ""),
            deleteAfter: Number.isInteger(r.deleteAfter) ? r.deleteAfter : 20, enabled: r.enabled !== false,
            channelIds: Array.isArray(r.channelIds) ? r.channelIds.map(String) : [], cooldown: Number.isInteger(r.cooldown) ? r.cooldown : 120,
        }, userId);
        counts.autoReplies++;
    }
    await roleMenus.loadRoleMenus(pool);
    for (const m of data.roleMenus || []) {
        const existing = roleMenus.getMenus().find((x) => x.name === m.name);
        await roleMenus.saveMenu(pool, {
            id: existing?.id ?? null, name: String(m.name).slice(0, 100), channelId: m.channelId || existing?.channelId || null, messageId: existing?.messageId ?? null,
            title: String(m.title || ""), description: String(m.description || ""), color: /^#[0-9a-fA-F]{6}$/.test(m.color || "") ? m.color : "#F4A11C",
            footer: String(m.footer || ""), footerIcon: String(m.footerIcon || ""), buttons: Array.isArray(m.buttons) ? m.buttons.filter((b) => b && b.roleId).slice(0, roleMenus.MAX_BUTTONS) : [],
        }, userId);
        counts.roleMenus++;
    }
    if (typeof data.faculty === "string" && data.faculty.trim() && writeFaculty) {
        await writeFaculty(data.faculty);
        counts.faculty = true;
    }
    return counts;
}

module.exports = { exportAll, checkBackup, restoreAll, VERSION };
