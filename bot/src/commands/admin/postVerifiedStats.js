const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, MessageFlags } = require("discord.js");
const { post } = require("../../lib/verifiedStatsMessage");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('post-verified-stats')
        .setDescription('Δημοσίευση στατιστικών μελών που ενημερώνονται αυτόματα, στο τρέχον κανάλι (διαχειριστές).')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .setContexts(InteractionContextType.Guild),

    run: async ({ interaction, client }) => {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
            await post(client, interaction.channel);
            await interaction.editReply({ content: 'Το μήνυμα δημοσιεύτηκε και θα ενημερώνεται κάθε 5 λεπτά. Αν υπήρχε προηγούμενο, διαγράφηκε.' });
        } catch (err) {
            console.error('/post-verified-stats failed:', err);
            await interaction.editReply({ content: 'Δεν ήταν δυνατή η δημοσίευση. Ελέγξτε ότι το bot μπορεί να στέλνει μηνύματα και embeds σε αυτό το κανάλι.' });
        }
    },

    options: { modOnly: true },
};
