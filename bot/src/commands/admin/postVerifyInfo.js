const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, MessageFlags } = require("discord.js");
const { verifyMessage } = require("../../lib/privacyNotice");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('post-verify-info')
        .setDescription('Δημοσίευση οδηγιών επαλήθευσης και ενημέρωσης απορρήτου στο τρέχον κανάλι (διαχειριστές).')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .setContexts(InteractionContextType.Guild),

    run: async ({ interaction }) => {
        // Mentions render but ping nobody, so running this again never mass-pings the server.
        await interaction.channel.send({ content: verifyMessage, allowedMentions: { parse: [] } });
        await interaction.reply({ content: 'Το μήνυμα δημοσιεύτηκε.', flags: MessageFlags.Ephemeral });
    },

    options: { modOnly: true },
};
