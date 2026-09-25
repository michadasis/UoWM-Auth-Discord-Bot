async function adminLog(client, embed) {
    if (!process.env.ADMIN_CHANNEL_ID) return;
    try {
        const channel = await client.channels.fetch(process.env.ADMIN_CHANNEL_ID);
        await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    } catch (err) {
        console.error(`Could not write to admin channel: ${err.message}`);
    }
}

module.exports = { adminLog };
