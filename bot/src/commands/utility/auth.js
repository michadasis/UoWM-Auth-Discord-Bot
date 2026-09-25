const { SlashCommandBuilder } = require("discord.js");
const { getVerification } = require("../../lib/services");
const { embedFor } = require("../../lib/messages");
const { codeButtonRow } = require("../../lib/codeEntry");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('auth')
        .setDescription('Επιβεβαίωση με το ιδρυματικό σας email. Θα λάβετε κωδικό μίας χρήσης.')
        .addStringOption((o) => o
            .setName('email')
            .setDescription('Το ιδρυματικό σας email ή όνομα χρήστη, π.χ. cs01234@uowm.gr')
            .setRequired(true)
            .setMaxLength(80)),

    run: async ({ interaction, client }) => {
        await interaction.deferReply({ ephemeral: interaction.guild !== null });

        let result;
        try {
            result = await getVerification(client).requestCode(interaction.user.id, interaction.options.getString('email', true));
        } catch (error) {
            console.error('/auth failed:', error);
            result = { code: 'error' };
        }

        if (result.code !== 'code_sent') {
            return interaction.editReply({ embeds: [embedFor(result)] });
        }

        await interaction.editReply({
            embeds: [{
                color: 0x0d86e3,
                title: 'Στάλθηκε κωδικός',
                description:
                    // Inline code: the "*" of the masked address would otherwise break Discord's bold markdown.
                    `Στείλαμε έναν εξαψήφιο κωδικό στο \`${result.maskedAddress}\` (ελέγξτε και τα Ανεπιθύμητα/Junk).\n\n` +
                    'Πατήστε «Εισαγωγή κωδικού» ή γράψτε `/code` και τον κωδικό. Ο κωδικός ισχύει για 10 λεπτά.',
                footer: { text: 'Δεν θα σας ζητηθεί ποτέ ο κωδικός πρόσβασης του ιδρυματικού σας λογαριασμού.' },
            }],
            components: [codeButtonRow()],
        });
    },

    options: {},
};
