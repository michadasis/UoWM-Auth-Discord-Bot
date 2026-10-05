const pool = require("../../lib/database");
const { handleMessage } = require("../../lib/autoReplies");
const { recordHit } = require("../../lib/usageStats");

// Automatic replies (rules edited in the admin panel).
module.exports = async (message) => {
    if (!message.guildId || message.guildId !== process.env.GUILD_ID) return;
    if (message.author?.bot || message.webhookId || !message.content) return;
    try {
        await handleMessage(message, Date.now(), (rule) => recordHit(pool, rule.id).catch((err) => console.error(`Counting an automatic reply failed: ${err.message}`)));
    } catch (err) {
        console.error(`Auto reply failed: ${err.message}`);
    }
};
