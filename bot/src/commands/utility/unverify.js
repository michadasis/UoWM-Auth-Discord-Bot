const { EmbedBuilder } = require("discord.js");
const colors = require("../../lib/colors");
const { removeVerification, AFFILIATION_LABELS } = require("../../lib/verification");
const { adminLog } = require("../../lib/adminLog");

module.exports = {
    data: {
        name: 'unverify',
        description: 'Αποσύνδεση του λογαριασμού σας και διαγραφή των δεδομένων επιβεβαίωσης.',
    },

    run: async ({ interaction, client }) => {
        const ephemeral = interaction.guild !== null;
        await interaction.deferReply({ ephemeral });

        try {
            const guild = await client.guilds.fetch(process.env.GUILD_ID);
            const record = await removeVerification(guild, interaction.user.id, 'User ran /unverify');

            if (!record) {
                const embed = new EmbedBuilder()
                    .setColor(colors.yellow)
                    .setTitle('Δεν βρέθηκε επιβεβαίωση')
                    .setDescription('Ο λογαριασμός σας δεν είναι επιβεβαιωμένος, οπότε δεν υπάρχουν δεδομένα προς διαγραφή.');
                return interaction.editReply({ embeds: [embed] });
            }

            await adminLog(client, new EmbedBuilder()
                .setColor(colors.orange)
                .setTitle('Αποσύνδεση λογαριασμού')
                .setDescription(`Ο χρήστης <@${interaction.user.id}> (${AFFILIATION_LABELS[record.affiliation]}) αποσύνδεσε τον λογαριασμό του με /unverify.`));

            const embed = new EmbedBuilder()
                .setColor(colors.blue)
                .setTitle('Ο λογαριασμός σας αποσυνδέθηκε')
                .setDescription('Τα δεδομένα επιβεβαίωσης διαγράφηκαν και οι σχετικοί ρόλοι αφαιρέθηκαν, μαζί με τους ρόλους εξαμήνων. Μπορείτε να επιβεβαιωθείτε ξανά οποιαδήποτε στιγμή με την εντολή `/auth`.');
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('/unverify failed:', error);
            await interaction.editReply({ content: 'Παρουσιάστηκε σφάλμα. Δοκιμάστε ξανά ή επικοινωνήστε με τους διαχειριστές.' });
        }
    },

    options: {},
};
