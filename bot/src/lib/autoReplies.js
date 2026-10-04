// Automatic replies: when a message matches a rule's triggers, the bot replies with the rule's
// text and deletes its reply after a while, so channels do not fill up. Rules are edited in the
// admin panel and stored in the database.
//
// A trigger is a phrase; it matches when every one of its words starts a word of the message.
// Capitals, accents and greeklish do not matter, so "παλια θεματ" matches "Πού είναι τα παλιά
// θέματα;" and "pou einai ta palia themata".

const { textToLatin } = require("./textMatch");
const { ensureSchema, getMeta, setMeta } = require("./messageStats");

let rules = [];
const cooldowns = new Map(); // `${ruleId}:${userId}` -> time of the last reply
const COOLDOWN_MS = 2 * 60 * 1000;

async function ensureAutoReplies(pool) {
    await pool.query(`CREATE TABLE IF NOT EXISTS auto_replies (
        id INT NOT NULL AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL,
        triggers TEXT NOT NULL,
        reply TEXT NOT NULL,
        delete_after INT NOT NULL DEFAULT 20,
        enabled TINYINT(1) NOT NULL DEFAULT 1,
        updated_by VARCHAR(20) NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
    )`);
}

const DEFAULT_RULE = {
    name: "Παλιά θέματα",
    triggers: "παλια θεματ\nθεματα εξετασ\nλυμενα θεματ\nπου ειναι τα θεματ\nπου βρισκω θεματ\nπαλιες σημειωσ",
    reply: "Τα παλιά θέματα, οι σημειώσεις και οι λύσεις είναι στα **pinned messages** (το εικονίδιο πινέζα πάνω δεξιά) του καναλιού κάθε μαθήματος. Αν δεν βλέπεις τα κανάλια των μαθημάτων, διάλεξε πρώτα εξάμηνο στο {εξάμηνα}.",
    delete_after: 20,
};

// Loads the rules; on a fresh install adds the "old exam papers" rule as a starting point.
async function loadAutoReplies(pool) {
    await ensureAutoReplies(pool);
    let rows = await pool.query("SELECT id, name, triggers, reply, delete_after, enabled FROM auto_replies ORDER BY id");
    // Only once: if someone deletes every rule later, it stays that way.
    await ensureSchema(pool);
    if (!rows.length && !(await getMeta(pool, "auto_replies_seeded"))) {
        await pool.query("INSERT INTO auto_replies (name, triggers, reply, delete_after) VALUES (?, ?, ?, ?)", [DEFAULT_RULE.name, DEFAULT_RULE.triggers, DEFAULT_RULE.reply, DEFAULT_RULE.delete_after]);
        rows = await pool.query("SELECT id, name, triggers, reply, delete_after, enabled FROM auto_replies ORDER BY id");
    }
    await setMeta(pool, "auto_replies_seeded", "1");
    rules = rows.map(toRule);
    return rules;
}

function toRule(r) {
    return {
        id: Number(r.id),
        name: r.name,
        triggers: r.triggers,
        reply: r.reply,
        deleteAfter: Number(r.delete_after),
        enabled: Boolean(Number(r.enabled)),
        phrases: parseTriggers(r.triggers),
    };
}

// Trigger text -> [[word, ...], ...], words in comparable form.
function parseTriggers(text) {
    return String(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
        .map((line) => textToLatin(line).split(" ").filter(Boolean))
        .filter((words) => words.length);
}

// The first enabled rule whose trigger matches the text, or null.
function findRule(text, list = rules) {
    const words = textToLatin(text).split(" ").filter(Boolean);
    if (!words.length) return null;
    for (const rule of list) {
        if (!rule.enabled) continue;
        if (rule.phrases.some((phrase) => phrase.every((p) => words.some((w) => w.startsWith(p))))) return rule;
    }
    return null;
}

// {εξάμηνα} becomes a link to the semester channel.
function renderReply(reply, env = process.env) {
    const channel = env.SEMESTER_CHANNEL_ID ? `<#${env.SEMESTER_CHANNEL_ID}>` : "#επιλογή-εξαμήνου";
    return reply.split("{εξάμηνα}").join(channel);
}

// Replies to a matching message. Returns the rule used, or null.
async function handleMessage(message, now = Date.now()) {
    const rule = findRule(message.content);
    if (!rule) return null;
    const key = `${rule.id}:${message.author.id}`;
    const last = cooldowns.get(key);
    if (last !== undefined && now - last < COOLDOWN_MS) return null;
    cooldowns.set(key, now);
    if (cooldowns.size > 5000) cooldowns.clear();

    const reply = await message.reply({ content: renderReply(rule.reply), allowedMentions: { repliedUser: true, parse: [] } });
    if (rule.deleteAfter > 0) {
        const timer = setTimeout(() => reply.delete().catch(() => {}), rule.deleteAfter * 1000);
        timer.unref?.();
    }
    return rule;
}

async function saveRule(pool, { id, name, triggers, reply, deleteAfter, enabled }, userId) {
    if (id) {
        await pool.query("UPDATE auto_replies SET name = ?, triggers = ?, reply = ?, delete_after = ?, enabled = ?, updated_by = ? WHERE id = ?", [name, triggers, reply, deleteAfter, enabled ? 1 : 0, userId, id]);
    } else {
        await pool.query("INSERT INTO auto_replies (name, triggers, reply, delete_after, enabled, updated_by) VALUES (?, ?, ?, ?, ?, ?)", [name, triggers, reply, deleteAfter, enabled ? 1 : 0, userId]);
    }
    return loadAutoReplies(pool);
}

async function deleteRule(pool, id) {
    await pool.query("DELETE FROM auto_replies WHERE id = ?", [id]);
    rules = rules.filter((r) => r.id !== Number(id));
}

const getRules = () => rules;

module.exports = { loadAutoReplies, findRule, parseTriggers, renderReply, handleMessage, saveRule, deleteRule, getRules, toRule, DEFAULT_RULE };
