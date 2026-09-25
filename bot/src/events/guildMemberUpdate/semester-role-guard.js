const { semesterConfig, semesterRolesToStrip } = require("../../lib/semesterRoles");

// Dyno lets members pick semester roles in #epilogh-eksamhnou. This keeps semester roles
// (and so the course channels) limited to verified students, whatever path the role came from.
module.exports = async (oldMember, newMember) => {
    if (newMember.guild.id !== process.env.GUILD_ID) return;

    const toStrip = semesterRolesToStrip(newMember.roles.cache.keys(), semesterConfig());
    if (!toStrip.length) return;

    try {
        await newMember.roles.remove(toStrip, 'Semester roles require the verified student role');
    } catch (err) {
        console.error(`Could not strip semester roles from ${newMember.id}: ${err.message}`);
    }
};
