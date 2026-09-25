const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, time, TimestampStyles } = require("discord.js");
const colors = require("../../lib/colors");
const { createLoginLink } = require("../../lib/authState");
const { getVerification } = require("../../lib/verification");

module.exports = {
    data: {
        name: 'auth',
        description: 'Επιβεβαίωση ιδιότητας με τον ιδρυματικό λογαριασμό UoWM.',
    },

    run: async ({ interaction }) => {
        const ephemeral = interaction.guild !== null;

        try {
            if (await getVerification(interaction.user.id)) {
                const embed = new EmbedBuilder()
                    .setColor(colors.green)
                    .setTitle('Ήδη επιβεβαιωμένος λογαριασμός')
                    .setDescription('Ο λογαριασμός σας στο Discord είναι ήδη επιβεβαιωμένος. Αν θέλετε να τον αποσυνδέσετε, χρησιμοποιήστε την εντολή `/unverify`.');
                return interaction.reply({ embeds: [embed], ephemeral });
            }

            const link = await createLoginLink(interaction.user.id);
            const expiresAt = new Date(link.expiresAt);

            const embed = new EmbedBuilder()
                .setColor(colors.blue)
                .setTitle('Επιβεβαίωση με ιδρυματικό λογαριασμό')
                .setDescription(
                    'Πατήστε το κουμπί για να συνδεθείτε στην επίσημη σελίδα του Πανεπιστημίου (sso.uowm.gr). ' +
                    'Ο κωδικός σας εισάγεται μόνο εκεί, ποτέ στο Discord.\n\n' +
                    `Ο σύνδεσμος είναι προσωπικός, χρησιμοποιείται μία φορά και λήγει ${time(expiresAt, TimestampStyles.RelativeTime)}. Μην τον μοιραστείτε με κανέναν.`
                )
                .setFooter({ text: 'Ελέγξτε ότι η διεύθυνση στον browser είναι https://sso.uowm.gr πριν εισάγετε τον κωδικό σας.' });

            const button = new ButtonBuilder().setLabel('Σύνδεση').setStyle(ButtonStyle.Link).setURL(link.url);

            await interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(button)], ephemeral });
        } catch (error) {
            console.error('/auth failed:', error);
            const embed = new EmbedBuilder()
                .setColor(colors.red)
                .setTitle('Σφάλμα')
                .setDescription('Δεν ήταν δυνατή η δημιουργία συνδέσμου. Δοκιμάστε ξανά σε λίγο.');
            await interaction.reply({ embeds: [embed], ephemeral: true }).catch(() => {});
        }
    },

    options: {},
};
