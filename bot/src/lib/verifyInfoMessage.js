// The message posted by /post-verify-info. The bot remembers where it is (bot_meta) and keeps it
// in sync with privacyNotice.js: it checks the file every minute and, when the text changes, posts
// it again (pinging everyone and the roles) and deletes the old one. Discord never sends
// notifications for edited messages, so a new message is the only way to ping on every update.

const fs = require("fs");
const pool = require("./database");
const { ensureSchema, getMeta, setMeta } = require("./messageStats");
const liveStats = require("./verifiedStatsMessage");

const NOTICE_FILE = require.resolve("./privacyNotice");
const META_KEY = "verify_info_message";
const CHECK_MS = 60 * 1000;
const UNKNOWN_MESSAGE = 10008;
const UNKNOWN_CHANNEL = 10003;

let loadedMtime = -1;

// The current text of privacyNotice.js, re-read from disk when the file has changed.
function currentText() {
    const mtime = fs.statSync(NOTICE_FILE).mtimeMs;
    if (mtime !== loadedMtime) {
        delete require.cache[NOTICE_FILE];
        loadedMtime = mtime;
    }
    return require(NOTICE_FILE).verifyMessage;
}

async function location() {
    const value = await getMeta(pool, META_KEY);
    if (!value) return null;
    const [channelId, messageId] = value.split(":");
    return { channelId, messageId };
}

// Reposts the message if its text differs from privacyNotice.js.
async function sync(client) {
    const where = await location();
    if (!where) return;
    try {
        const text = currentText();
        const channel = await client.channels.fetch(where.channelId);
        const message = await channel.messages.fetch(where.messageId);
        if (message.content === text) return;
        await post(client, channel);
        console.log("Verify info message reposted from privacyNotice.js.");
    } catch (err) {
        if (err.code === UNKNOWN_MESSAGE || err.code === UNKNOWN_CHANNEL) {
            console.log("Verify info message was deleted, no longer updating it.");
            await pool.query("DELETE FROM bot_meta WHERE meta_key = ?", [META_KEY]);
        } else {
            console.error(`Updating verify info message failed: ${err.message}`);
        }
    }
}

// Posts the text in channel (pinging everyone and the roles), remembers it and deletes the
// previous one, if any. If the live stats message of /post-verified-stats is in the same channel,
// it is posted again right after, so it stays below the instructions.
async function post(client, channel) {
    const previous = await location();
    const message = await channel.send({ content: currentText(), allowedMentions: { parse: ["everyone", "roles"] } });
    await setMeta(pool, META_KEY, `${channel.id}:${message.id}`);

    if (previous && previous.messageId !== message.id) {
        try {
            const oldChannel = await client.channels.fetch(previous.channelId);
            await (await oldChannel.messages.fetch(previous.messageId)).delete();
        } catch {
            // Already gone.
        }
    }

    const stats = await liveStats.location().catch(() => null);
    if (stats && stats.channelId === channel.id) {
        await liveStats.post(client, channel).catch((err) => console.error(`Moving live stats below the verify info failed: ${err.message}`));
    }
    return message;
}

async function startSyncing(client) {
    await ensureSchema(pool);
    await sync(client);
    setInterval(() => sync(client).catch((err) => console.error("Verify info sync failed:", err)), CHECK_MS).unref();
}

module.exports = { post, sync, startSyncing, currentText };
