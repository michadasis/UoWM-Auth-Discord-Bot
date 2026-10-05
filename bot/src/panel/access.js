// Who may use the panel: the server owner, members with the Administrator permission, and members
// with the Admin or Moderator role. Checked against the live server on every request (cached for a
// short time), so losing the role means losing access within a minute.

const { PermissionFlagsBits } = require("discord.js");

const CACHE_MS = 60 * 1000;
const cache = new Map(); // userId -> { at, member | null }

// With panel access roles or members set (Ρυθμίσεις > Πρόσβαση στον πίνακα), only those get in;
// otherwise the Admin and Moderator roles. The owner and Administrators always get in, so nobody
// can lock everyone out.
function canUsePanel(member, { adminRoleId, moderatorRoleId, accessRoleIds = [], accessUserIds = [] }) {
    if (!member) return false;
    if (member.id === member.guild.ownerId) return true;
    if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
    const roles = member.roles?.cache;
    if (accessRoleIds.length || accessUserIds.length) {
        return accessUserIds.includes(member.id) || Boolean(roles && accessRoleIds.some((id) => roles.has(id)));
    }
    return Boolean(roles && ((adminRoleId && roles.has(adminRoleId)) || (moderatorRoleId && roles.has(moderatorRoleId))));
}

// The guild member, or null if they are not in the server.
async function fetchMember(guild, userId, now = Date.now()) {
    const hit = cache.get(userId);
    if (hit && now - hit.at < CACHE_MS) return hit.member;
    const member = await guild.members.fetch({ user: userId, force: true }).catch(() => null);
    cache.set(userId, { at: now, member });
    return member;
}

const forget = (userId) => cache.delete(userId);

module.exports = { canUsePanel, fetchMember, forget };
