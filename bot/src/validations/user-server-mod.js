const { EmbedBuilder, MessageFlags } = require("discord.js");
const colors = require('../lib/colors');

// Commands with options.modOnly can only be run inside the guild by members with the admin OR moderator role.
module.exports = async ({ interaction, commandObj }) => {
    if (!commandObj.options?.modOnly) return;

    const roles = interaction.member?.roles?.cache;
    const allowed = roles && [process.env.ADMIN_ROLE_ID, process.env.MODERATOR_ROLE_ID].some((id) => id && roles.has(id));
    if (allowed) return;

    const errorEmbed = new EmbedBuilder()
        .setColor(colors.red)
        .setTitle('Σφάλμα εκτέλεσης εντολής')
        .setDescription('Αυτή η εντολή μπορεί να εκτελεστεί μόνο από διαχειριστές ή συντονιστές του server.');
    await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral }).catch(() => {});
    return true;
};
