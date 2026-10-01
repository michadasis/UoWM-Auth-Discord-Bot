const { decide, ping, remove } = require("../../lib/semesterPing");

// Pings newly verified members in the semester channel, and removes the ping once they pick a
// semester. Needs the old roles, so updates for members the bot had not cached are skipped.
module.exports = async (oldMember, newMember) => {
    if (newMember.guild.id !== process.env.GUILD_ID || oldMember.partial || newMember.user?.bot) return;
    const action = decide(oldMember.roles.cache.keys(), newMember.roles.cache.keys());
    if (action === "ping") await ping(newMember.client, newMember.id);
    if (action === "clear") await remove(newMember.client, newMember.id);
};
