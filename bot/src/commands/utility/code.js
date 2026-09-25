const { SlashCommandBuilder } = require("discord.js");
const { handleCode } = require("../../lib/codeEntry");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('code')
        .setDescription('Εισαγωγή του κωδικού επιβεβαίωσης που λάβατε στο email σας.')
        .addStringOption((o) => o
            .setName('code')
            .setDescription('Ο εξαψήφιος κωδικός, π.χ. 123456')
            .setRequired(true)
            .setMinLength(6)
            .setMaxLength(7)),

    run: async ({ interaction }) => {
        await handleCode(interaction, interaction.options.getString('code', true));
    },

    options: {},
};
