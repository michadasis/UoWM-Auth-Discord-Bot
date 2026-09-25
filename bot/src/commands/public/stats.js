const { EmbedBuilder, MessageFlags } = require("discord.js");
const pool = require("../../lib/database");
const colors = require("../../lib/colors");

module.exports = {
    data: {
        name: 'stats',
        description: 'Στατιστικά του bot.',
    },

    run: async ({ interaction }) => {
        let totalSeconds = interaction.client.uptime / 1000;
        const days = Math.floor(totalSeconds / 86400);
        totalSeconds %= 86400;
        const hours = Math.floor(totalSeconds / 3600);
        totalSeconds %= 3600;
        const minutes = Math.floor(totalSeconds / 60);

        const rows = await pool.query('SELECT affiliation, COUNT(*) AS n FROM users GROUP BY affiliation');
        const count = (affiliation) => Number(rows.find((r) => r.affiliation === affiliation)?.n ?? 0);

        const statsEmbed = new EmbedBuilder()
            .setColor(colors.blue)
            .setTitle('Στατιστικά')
            .setDescription(
                `**Διάρκεια λειτουργίας:** \`${days}\` ημέρες, \`${hours}\` ώρες, \`${minutes}\` λεπτά\n\n` +
                `**Επιβεβαιωμένοι φοιτητές:** \`${count('student')}\`\n` +
                `**Επιβεβαιωμένοι καθηγητές:** \`${count('faculty')}\`\n` +
                `**Επιβεβαιωμένο προσωπικό:** \`${count('staff')}\``
            );

        await interaction.reply({ embeds: [statsEmbed], flags: interaction.guild !== null ? MessageFlags.Ephemeral : undefined });
    },

    options: {},
};
