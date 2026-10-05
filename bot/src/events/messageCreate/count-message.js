const pool = require("../../lib/database");
const { dayKey, shouldCount, statsChannelId, recordMessage } = require("../../lib/messageStats");
const { recordHour } = require("../../lib/usageStats");

// Counts messages per day and channel for /stats, and per hour for the panel. Stores no content
// and no author.
module.exports = async (message) => {
    if (!shouldCount(message, process.env.GUILD_ID)) return;

    try {
        await recordMessage(pool, dayKey(message.createdAt), statsChannelId(message.channel));
        await recordHour(pool, message.createdAt);
    } catch (err) {
        console.error(`Counting message failed: ${err.message}`);
    }
};
