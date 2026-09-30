const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, MessageFlags } = require("discord.js");
const { post } = require("../../lib/verifyInfoMessage");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('post-verify-info')
        .setDescription('Δημοσίευση οδηγιών επαλήθευσης και ενημέρωσης απορρήτου στο τρέχον κανάλι (διαχειριστές).')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .setContexts(InteractionContextType.Guild),

    run: async ({ interaction, client }) => {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
            await post(client, interaction.channel);
            await interaction.editReply({ content: 'Το μήνυμα δημοσιεύτηκε και θα ενημερώνεται αυτόματα όταν αλλάζει το privacyNotice.js. Αν υπήρχε προηγούμενο, διαγράφηκε.' });
        } catch (err) {
            console.error('/post-verify-info failed:', err);
            await interaction.editReply({ content: 'Δεν ήταν δυνατή η δημοσίευση. Ελέγξτε ότι το bot μπορεί να στέλνει μηνύματα σε αυτό το κανάλι.' });
        }
    },

    options: { modOnly: true },
};
