// The small slice of Discord that lib/linker.js needs, on top of discord.js. Faked in tests.

function createDiscordAdapter(client, { logger = console } = {}) {
    const guild = () => client.guilds.fetch(process.env.GUILD_ID);
    const fetchMember = async (userId) => (await guild()).members.fetch(userId).catch(() => null);

    return {
        // { roles: string[] } or null when the user is not in the server.
        async getMember(userId) {
            const member = await fetchMember(userId);
            return member ? { roles: [...member.roles.cache.keys()] } : null;
        },

        async addRole(userId, roleId, reason) {
            const member = await fetchMember(userId);
            if (!member) throw new Error('member left the server');
            await member.roles.add(roleId, reason);
        },

        async removeRole(userId, roleId, reason) {
            const member = await fetchMember(userId);
            if (member) await member.roles.remove(roleId, reason);
        },

        // Best effort: users may have DMs disabled.
        async sendDM(userId, embed) {
            try {
                const user = await client.users.fetch(userId);
                await user.send({ embeds: [embed] });
            } catch (err) {
                logger.warn(`Could not DM user ${userId}: ${err.message}`);
            }
        },

        async adminLog(message) {
            if (!process.env.ADMIN_CHANNEL_ID) return;
            try {
                const channel = await client.channels.fetch(process.env.ADMIN_CHANNEL_ID);
                await channel.send(message);
            } catch (err) {
                logger.error(`Could not write to admin channel: ${err.message}`);
            }
        },

        async deleteMessage(channelId, messageId) {
            if (!channelId || !messageId) return;
            try {
                const channel = await client.channels.fetch(channelId);
                await (await channel.messages.fetch(messageId)).delete();
            } catch (err) {
                logger.warn(`Could not delete message ${messageId}: ${err.message}`);
            }
        },
    };
}

module.exports = { createDiscordAdapter };
