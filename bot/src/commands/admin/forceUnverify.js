const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, EmbedBuilder, MessageFlags } = require("discord.js");
const colors = require("../../lib/colors");
const { removeVerification, AFFILIATION_LABELS } = require("../../lib/verification");
const { adminLog } = require("../../lib/adminLog");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('force-unverify')
        .setDescription('Αφαίρεση επαλήθευσης και διαγραφή δεδομένων ενός μέλους (διαχειριστές).')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .setContexts(InteractionContextType.Guild)
        .addUserOption((o) => o.setName('user').setDescription('Το μέλος').setRequired(true))
        .addStringOption((o) => o.setName('reason').setDescription('Αιτιολογία').setMaxLength(300)),

    run: async ({ interaction, client }) => {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const target = interaction.options.getUser('user', true);
        const reason = interaction.options.getString('reason') || 'Χωρίς αιτιολογία';

        try {
            const record = await removeVerification(interaction.guild, target.id, `force-unverify by ${interaction.user.id}: ${reason}`);
            if (!record) {
                return interaction.editReply({ content: `Ο χρήστης <@${target.id}> δεν είναι επαληθευμένος.` });
            }

            await adminLog(client, new EmbedBuilder()
                .setColor(colors.orange)
                .setTitle('Αναγκαστική αποσύνδεση')
                .setDescription(`Ο <@${interaction.user.id}> αφαίρεσε την επαλήθευση του <@${target.id}> (${AFFILIATION_LABELS[record.affiliation]}).\nΑιτιολογία: ${reason}`));

            await target.send({ embeds: [new EmbedBuilder()
                .setColor(colors.orange)
                .setTitle('Η επαλήθευσή σας αφαιρέθηκε')
                .setDescription('Οι διαχειριστές του server «Πληροφορική UoWM» αφαίρεσαν την επαλήθευση του λογαριασμού σας και τα σχετικά δεδομένα διαγράφηκαν. Μπορείτε να επαληθευτείτε ξανά με την εντολή `/auth` ή να επικοινωνήσετε με τους διαχειριστές.')] }).catch(() => {});

            await interaction.editReply({ content: `Η επαλήθευση του <@${target.id}> αφαιρέθηκε και τα δεδομένα του διαγράφηκαν.` });
        } catch (error) {
            console.error('/force-unverify failed:', error);
            await interaction.editReply({ content: 'Παρουσιάστηκε σφάλμα κατά την αφαίρεση της επαλήθευσης.' });
        }
    },

    options: { modOnly: true },
};
