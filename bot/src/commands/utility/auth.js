const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, time, TimestampStyles } = require("discord.js");
const colors = require("../../lib/colors");
const { createLoginLink } = require("../../lib/authState");
const { getVerification } = require("../../lib/verification");

const EMAIL_MODE = process.env.AUTH_PROVIDER === 'email';

const HOW_IT_WORKS = EMAIL_MODE
    ? 'Πατήστε το κουμπί, γράψτε το όνομα χρήστη του ιδρυματικού σας λογαριασμού (π.χ. cs01234) και θα λάβετε κωδικό μίας χρήσης στο @uowm.gr email σας.'
    : 'Πατήστε το κουμπί για να συνδεθείτε στην επίσημη σελίδα του Πανεπιστημίου (sso.uowm.gr). Ο κωδικός σας εισάγεται μόνο εκεί, ποτέ στο Discord.';

const FOOTER = EMAIL_MODE
    ? 'Δεν θα σας ζητηθεί ποτέ ο κωδικός πρόσβασης του ιδρυματικού σας λογαριασμού.'
    : 'Ελέγξτε ότι η διεύθυνση στον browser είναι https://sso.uowm.gr πριν εισάγετε τον κωδικό σας.';

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
                    `${HOW_IT_WORKS}\n\n` +
                    `Ο σύνδεσμος είναι προσωπικός, χρησιμοποιείται μία φορά και λήγει ${time(expiresAt, TimestampStyles.RelativeTime)}. Μην τον μοιραστείτε με κανέναν.`
                )
                .setFooter({ text: FOOTER });

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
