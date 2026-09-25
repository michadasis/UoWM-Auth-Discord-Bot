const { purgeExpired } = require("../../lib/cleanup");
const { semesterConfig, semesterRolesToStrip } = require("../../lib/semesterRoles");

const PURGE_INTERVAL_MS = 15 * 60 * 1000;

// Catches role changes that happened while the bot was offline.
async function sweepSemesterRoles(client) {
    const config = semesterConfig();
    if (!config.semesterRoleIds.length) return;

    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const members = await guild.members.fetch();
    let stripped = 0;
    for (const member of members.values()) {
        const toStrip = semesterRolesToStrip(member.roles.cache.keys(), config);
        if (toStrip.length) {
            await member.roles.remove(toStrip, 'Semester roles require the verified student role');
            stripped++;
        }
    }
    if (stripped) console.log(`Semester role sweep: stripped roles from ${stripped} member(s).`);
}

module.exports = async (c, client) => {
    const purge = () => purgeExpired().catch((err) => console.error("Purging expired codes failed:", err));
    await purge();
    setInterval(purge, PURGE_INTERVAL_MS).unref();

    await sweepSemesterRoles(client).catch((err) => console.error('Semester role sweep failed:', err));
};
