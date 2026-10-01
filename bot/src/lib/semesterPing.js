// After a member gets a role that lets them pick semesters (Φοιτητής, or Προσωρινή άδεια if
// allowed), the bot pings them in the semester channel so they know where to go next. The
// message is deleted as soon as they pick a semester, or after SEMESTER_PING_SECONDS (default
// 5) at the latest, so the channel never fills up. Pending pings survive restarts (bot_meta).

const pool = require("./database");
const { getMeta, setMeta, ensureSchema } = require("./messageStats");
const { semesterConfig } = require("./semesterRoles");

const META_KEY = "semester_pings";
const DEFAULT_SECONDS = 5;

const pending = new Map(); // userId -> { channelId, messageId, deleteAt, timer }

function delayMs(env = process.env) {
    const seconds = Number(env.SEMESTER_PING_SECONDS);
    return (Number.isFinite(seconds) && seconds >= 1 ? seconds : DEFAULT_SECONDS) * 1000;
}

const pingText = (userId) => `<@${userId}> καλώς ήρθες! Διάλεξε εδώ τα εξάμηνά σου, και περισσότερα από ένα αν χρωστάς μαθήματα.`;

async function save() {
    const data = {};
    for (const [userId, p] of pending) data[userId] = { c: p.channelId, m: p.messageId, at: p.deleteAt };
    await setMeta(pool, META_KEY, JSON.stringify(data)).catch((err) => console.error(`Saving semester pings failed: ${err.message}`));
}

async function remove(client, userId) {
    const p = pending.get(userId);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(userId);
    try {
        const channel = await client.channels.fetch(p.channelId);
        await channel.messages.delete(p.messageId);
    } catch {
        // Already gone.
    }
    await save();
}

function schedule(client, userId, entry) {
    entry.timer = setTimeout(() => remove(client, userId), Math.max(0, entry.deleteAt - Date.now()));
    entry.timer.unref?.();
    pending.set(userId, entry);
}

// Decides from a member update whether to ping (an allowed role was just added and the member
// has no semester yet) or to clean up (a semester role was just added).
function decide(oldRoleIds, newRoleIds, config = semesterConfig()) {
    const before = new Set(oldRoleIds);
    const after = new Set(newRoleIds);
    const gained = [...after].filter((id) => !before.has(id));
    if (gained.some((id) => config.semesterRoleIds.includes(id))) return "clear";
    const hasSemester = config.semesterRoleIds.some((id) => after.has(id));
    const hadAllowed = config.allowedRoleIds.some((id) => before.has(id));
    if (!hasSemester && !hadAllowed && gained.some((id) => config.allowedRoleIds.includes(id))) return "ping";
    return null;
}

async function ping(client, userId) {
    const channelId = process.env.SEMESTER_CHANNEL_ID;
    if (!channelId || pending.has(userId)) return;
    try {
        const channel = await client.channels.fetch(channelId);
        const message = await channel.send({ content: pingText(userId), allowedMentions: { users: [userId] } });
        schedule(client, userId, { channelId, messageId: message.id, deleteAt: Date.now() + delayMs() });
        await save();
    } catch (err) {
        console.error(`Semester ping for ${userId} failed: ${err.message}`);
    }
}

// On startup: pick up pings from before a restart (deleting the ones that are overdue).
async function restore(client) {
    await ensureSchema(pool);
    let data = {};
    try {
        data = JSON.parse((await getMeta(pool, META_KEY)) || "{}");
    } catch {
        data = {};
    }
    for (const [userId, p] of Object.entries(data)) {
        if (p && p.c && p.m) schedule(client, userId, { channelId: p.c, messageId: p.m, deleteAt: Number(p.at) || 0 });
    }
}

module.exports = { decide, ping, remove, restore, delayMs, pingText, pending };
