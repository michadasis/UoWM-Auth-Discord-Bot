// The live statistics message posted by /post-verified-stats. The bot remembers where it is
// (bot_meta) and edits it every few minutes, also across restarts. Posting again moves it.

const pool = require("./database");
const { ensureSchema, getMeta, setMeta } = require("./messageStats");
const { membersEmbed } = require("./memberStats");

const META_KEY = "verified_stats_message";
const REFRESH_MS = 5 * 60 * 1000;
const UNKNOWN_MESSAGE = 10008;
const UNKNOWN_CHANNEL = 10003;

async function liveEmbed(client) {
    return (await membersEmbed(client)).setFooter({ text: 'Ενημερώνεται αυτόματα κάθε 5 λεπτά · Τελευταία ενημέρωση' }).setTimestamp(new Date());
}

async function location() {
    const value = await getMeta(pool, META_KEY);
    if (!value) return null;
    const [channelId, messageId] = value.split(":");
    return { channelId, messageId };
}

async function forget() {
    await pool.query("DELETE FROM bot_meta WHERE meta_key = ?", [META_KEY]);
}

// Edits the live message. Forgets it if it was deleted, so the bot stops trying.
async function refresh(client) {
    const where = await location();
    if (!where) return;
    try {
        const channel = await client.channels.fetch(where.channelId);
        const message = await channel.messages.fetch(where.messageId);
        await message.edit({ embeds: [await liveEmbed(client)] });
    } catch (err) {
        if (err.code === UNKNOWN_MESSAGE || err.code === UNKNOWN_CHANNEL) {
            console.log("Live stats message was deleted, no longer updating it.");
            await forget();
        } else {
            console.error(`Updating live stats message failed: ${err.message}`);
        }
    }
}

// Posts a new live message in channel and deletes the previous one, if any.
async function post(client, channel) {
    const previous = await location();
    const message = await channel.send({ embeds: [await liveEmbed(client)] });
    await setMeta(pool, META_KEY, `${channel.id}:${message.id}`);

    if (previous) {
        try {
            const oldChannel = await client.channels.fetch(previous.channelId);
            await (await oldChannel.messages.fetch(previous.messageId)).delete();
        } catch {
            // Already gone.
        }
    }
    return message;
}

async function startRefreshing(client) {
    await ensureSchema(pool);
    await refresh(client);
    setInterval(() => refresh(client).catch((err) => console.error("Live stats refresh failed:", err)), REFRESH_MS).unref();
}

module.exports = { post, refresh, startRefreshing };
