const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, EmbedBuilder } = require("discord.js");
const colors = require("../../lib/colors");
const { verifyInstructions, privacyNotice } = require("../../lib/privacyNotice");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('post-verify-info')
        .setDescription('Δημοσίευση οδηγιών επιβεβαίωσης και ενημέρωσης απορρήτου στο τρέχον κανάλι (διαχειριστές).')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .setContexts(InteractionContextType.Guild),

    run: async ({ interaction }) => {
        await interaction.channel.send({
            embeds: [
                new EmbedBuilder().setColor(colors.blue).setTitle('Επιβεβαίωση μέλους').setDescription(verifyInstructions),
                new EmbedBuilder().setColor(colors.green).setTitle('Προστασία δεδομένων').setDescription(privacyNotice),
            ],
        });
        await interaction.reply({ content: 'Το μήνυμα δημοσιεύτηκε.', ephemeral: true });
    },

    options: { modOnly: true },
};
