// Turns the settings form into validated changes. Nothing is saved unless every field is valid.

const { ChannelType, PermissionFlagsBits } = require("discord.js");

const TEXT_CHANNELS = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

// Roles and channels to offer in the form, from the live server.
function guildOptions(guild) {
    const roles = [...guild.roles.cache.values()]
        .filter((r) => r.id !== guild.id && !r.managed)
        .sort((a, b) => b.position - a.position)
        .map((r) => ({ id: r.id, name: r.name, color: r.color }));
    const channels = [...guild.channels.cache.values()]
        .filter((c) => TEXT_CHANNELS.includes(c.type))
        .sort((a, b) => (a.parent?.rawPosition ?? -1) - (b.parent?.rawPosition ?? -1) || a.rawPosition - b.rawPosition)
        .map((c) => ({ id: c.id, name: c.name, category: c.parent?.name ?? null }));
    return { roles, channels };
}

function checkRole(guild, id, def, errors) {
    const role = guild.roles.cache.get(id);
    if (!role) return errors.push(`${def.label}: ο ρόλος δεν υπάρχει.`);
    if (role.id === guild.id) return errors.push(`${def.label}: δεν επιτρέπεται το @everyone.`);
    if (role.managed) return errors.push(`${def.label}: ο @${role.name} ανήκει σε bot ή integration.`);
    const botTop = guild.members.me?.roles.highest.position ?? Infinity;
    if (def.assigned && role.position >= botTop) {
        errors.push(`${def.label}: ο @${role.name} είναι πάνω από τον ρόλο του bot, οπότε το bot δεν μπορεί να τον δίνει. Μετακινήστε τον ρόλο του bot πιο πάνω.`);
    }
}

function checkChannel(guild, id, def, errors) {
    const channel = guild.channels.cache.get(id);
    if (!channel || !TEXT_CHANNELS.includes(channel.type)) return errors.push(`${def.label}: το κανάλι δεν υπάρχει ή δεν είναι κανάλι κειμένου.`);
    const me = guild.members.me;
    const needed = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks];
    if (me && !channel.permissionsFor(me)?.has(needed)) {
        errors.push(`${def.label}: το bot χρειάζεται View Channel, Send Messages και Embed Links στο #${channel.name}.`);
    }
}

// form: URLSearchParams with every field's value, plus <KEY>__env=1 to drop a panel override.
// settings: current, from listSettings. Returns { changes, errors }, where changes are
// [{ key, label, value }] with value null meaning "back to .env".
function readSettingsForm(form, settings, guild) {
    const changes = [];
    const errors = [];
    for (const def of settings) {
        if (form.get(`${def.key}__env`) === "1") {
            if (def.source === "panel") changes.push({ key: def.key, label: def.label, value: null });
            continue;
        }
        let value;
        if (def.type === "roles") {
            const ids = [...new Set(form.getAll(def.key).map((v) => v.trim()).filter(Boolean))];
            ids.forEach((id) => checkRole(guild, id, def, errors));
            value = ids.join(",");
        } else if (def.type === "lines") {
            const lines = String(form.get(def.key) ?? "").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            if (lines.length > (def.maxLines ?? 20)) errors.push(`${def.label}: έως ${def.maxLines} γραμμές.`);
            lines.forEach((l, i) => { if (l.length > (def.maxLength ?? 200)) errors.push(`${def.label}: η γραμμή ${i + 1} ξεπερνά τους ${def.maxLength} χαρακτήρες.`); });
            value = lines.join("\n");
        } else if (def.type === "ids") {
            const ids = [...new Set(String(form.get(def.key) ?? "").split(/[\s,]+/).filter(Boolean))];
            const bad = ids.filter((id) => !/^\d{17,20}$/.test(id));
            if (bad.length) errors.push(`${def.label}: μη έγκυρο ID: ${bad.slice(0, 3).join(", ")}.`);
            value = ids.join(",");
        } else if (def.type === "number") {
            value = String(form.get(def.key) ?? "").trim();
            const n = Number(value);
            if (value && (!Number.isInteger(n) || n < def.min || n > def.max)) errors.push(`${def.label}: ακέραιος από ${def.min} έως ${def.max}.`);
        } else if (def.type === "text") {
            value = String(form.get(def.key) ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
            if (value.length > (def.maxLength ?? 200)) errors.push(`${def.label}: έως ${def.maxLength} χαρακτήρες.`);
        } else {
            value = String(form.get(def.key) ?? "").trim();
            if (value) (def.type === "role" ? checkRole : checkChannel)(guild, value, def, errors);
        }
        // Without an override, a value equal to .env stays "from .env"; anything else becomes an override.
        const changed = def.source === "panel" ? value !== def.value : value !== (def.envValue || "");
        if (changed) changes.push({ key: def.key, label: def.label, value });
    }
    return { changes: errors.length ? [] : changes, errors };
}

module.exports = { guildOptions, readSettingsForm };
