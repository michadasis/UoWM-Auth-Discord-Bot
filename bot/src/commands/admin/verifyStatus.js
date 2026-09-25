const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, EmbedBuilder, time } = require("discord.js");
const colors = require("../../lib/colors");
const pool = require("../../lib/database");
const { getVerification, AFFILIATION_LABELS } = require("../../lib/verification");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('verify-status')
        .setDescription('Κατάσταση επιβεβαίωσης ενός μέλους (διαχειριστές).')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .setContexts(InteractionContextType.Guild)
        .addUserOption((o) => o.setName('user').setDescription('Το μέλος').setRequired(true)),

    run: async ({ interaction }) => {
        const target = interaction.options.getUser('user', true);
        const record = await getVerification(target.id);
        const guestRows = await pool.query('SELECT reason, given_by FROM guests WHERE discord_id = ?', [target.id]);
        const pending = await pool.query(
            'SELECT COUNT(*) AS n FROM email_challenges WHERE discord_user_id = ? AND expires_at > ?',
            [target.id, Date.now()],
        );

        const guestText = guestRows.length
            ? `Ναι, από <@${guestRows[0].given_by}>: ${guestRows[0].reason}`.slice(0, 1024)
            : 'Όχι';

        const embed = new EmbedBuilder()
            .setColor(record ? colors.green : colors.yellow)
            .setTitle('Κατάσταση επιβεβαίωσης')
            .addFields(
                { name: 'Μέλος', value: `<@${target.id}>` },
                { name: 'Επιβεβαιωμένος', value: record ? 'Ναι' : 'Όχι', inline: true },
                { name: 'Ιδιότητα', value: record ? AFFILIATION_LABELS[record.affiliation] : '-', inline: true },
                { name: 'Ημερομηνία', value: record ? time(new Date(record.verified_at)) : '-', inline: true },
                { name: 'Guest', value: guestText },
                { name: 'Εκκρεμής κωδικός email', value: Number(pending[0].n) > 0 ? 'Ναι' : 'Όχι' },
            );

        await interaction.reply({ embeds: [embed], ephemeral: true, allowedMentions: { parse: [] } });
    },

    options: { modOnly: true },
};
