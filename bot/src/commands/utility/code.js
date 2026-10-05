const { SlashCommandBuilder, InteractionContextType } = require("discord.js");
const { handleCode } = require("../../lib/codeEntry");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('code')
        .setDescription('Εισαγωγή του κωδικού επαλήθευσης που λάβατε στο email σας.')
        .addStringOption((o) => o
            .setName('code')
            .setDescription('Ο εξαψήφιος κωδικός, π.χ. 123456')
            .setRequired(true)
            .setMinLength(6)
            .setMaxLength(7))
        // Only inside the server, like /auth.
        .setContexts(InteractionContextType.Guild),

    run: async ({ interaction }) => {
        await handleCode(interaction, interaction.options.getString('code', true));
    },

    options: {},
};
