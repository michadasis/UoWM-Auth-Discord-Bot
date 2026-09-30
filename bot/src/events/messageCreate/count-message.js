const pool = require("../../lib/database");
const { dayKey, shouldCount, statsChannelId, recordMessage } = require("../../lib/messageStats");

// Counts messages per day and channel for /stats. Stores no content and no author.
module.exports = async (message) => {
    if (!shouldCount(message, process.env.GUILD_ID)) return;

    try {
        await recordMessage(pool, dayKey(message.createdAt), statsChannelId(message.channel));
    } catch (err) {
        console.error(`Counting message failed: ${err.message}`);
    }
};
