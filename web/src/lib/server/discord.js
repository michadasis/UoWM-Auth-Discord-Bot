// Thin Discord REST client used by the web service (the bot process holds the gateway connection).

const API = 'https://discord.com/api/v10';

export function createDiscordClient({ token, guildId }, { fetchImpl = fetch, logger = console } = {}) {
    async function call(method, path, { body, reason } = {}) {
        const headers = { Authorization: `Bot ${token}` };
        if (body) headers['Content-Type'] = 'application/json';
        if (reason) headers['X-Audit-Log-Reason'] = encodeURIComponent(reason);
        const res = await fetchImpl(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`Discord ${method} ${path} failed: ${res.status} ${await res.text()}`);
        return res.status === 204 ? true : res.json();
    }

    return {
        // Returns { roles: string[] } or null when the user is not in the guild.
        async getMember(userId) {
            const member = await call('GET', `/guilds/${guildId}/members/${userId}`);
            return member ? { roles: member.roles } : null;
        },

        async addRole(userId, roleId, reason) {
            await call('PUT', `/guilds/${guildId}/members/${userId}/roles/${roleId}`, { reason });
        },

        async removeRole(userId, roleId, reason) {
            await call('DELETE', `/guilds/${guildId}/members/${userId}/roles/${roleId}`, { reason });
        },

        // Best effort: users may have DMs disabled.
        async sendDM(userId, embed) {
            try {
                const channel = await call('POST', '/users/@me/channels', { body: { recipient_id: userId } });
                await call('POST', `/channels/${channel.id}/messages`, { body: { embeds: [embed] } });
                return true;
            } catch (err) {
                logger.warn(`Could not DM user ${userId}: ${err.message}`);
                return false;
            }
        },

        async sendChannelMessage(channelId, message) {
            if (!channelId) return;
            try {
                await call('POST', `/channels/${channelId}/messages`, { body: message });
            } catch (err) {
                logger.error(`Could not post to channel ${channelId}: ${err.message}`);
            }
        },

        async deleteMessage(channelId, messageId) {
            if (!channelId || !messageId) return;
            try {
                await call('DELETE', `/channels/${channelId}/messages/${messageId}`);
            } catch (err) {
                logger.warn(`Could not delete message ${messageId}: ${err.message}`);
            }
        },
    };
}
