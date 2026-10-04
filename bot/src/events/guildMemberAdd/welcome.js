const { welcome } = require("../../lib/welcome");

module.exports = async (member) => {
    if (member.guild.id !== process.env.GUILD_ID) return;
    await welcome(member).catch((err) => console.error(`Welcome message for ${member.id} failed: ${err.message}`));
};
