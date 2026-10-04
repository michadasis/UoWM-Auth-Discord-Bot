const { handleMessage } = require("../../lib/autoReplies");

// Automatic replies (rules edited in the admin panel).
module.exports = async (message) => {
    if (!message.guildId || message.guildId !== process.env.GUILD_ID) return;
    if (message.author?.bot || message.webhookId || !message.content) return;
    try {
        await handleMessage(message);
    } catch (err) {
        console.error(`Auto reply failed: ${err.message}`);
    }
};
