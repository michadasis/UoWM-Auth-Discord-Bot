const { AttachmentBuilder, MessageFlags } = require("discord.js");
const pool = require("../../lib/database");
const { dayKey, dailyTotals } = require("../../lib/messageStats");
const { OUTSIDE_PERIODS, canView, periodsForYear } = require("../../lib/activityData");
const { buildActivityCsv } = require("../../lib/activityCsv");

// "Λήψη CSV" button under /stats activity. customId: stats-csv:<year>:<channelId|all>.
// Access is checked again here, so the button never exposes a channel the clicker cannot see.
module.exports = async (interaction) => {
    if (!interaction.isButton() || !interaction.customId.startsWith('stats-csv:')) return;

    const [, yearText, channelPart] = interaction.customId.split(':');
    const year = Number(yearText);
    const channelId = channelPart === 'all' ? null : channelPart;
    if (!Number.isInteger(year) || (channelId && !/^\d{17,20}$/.test(channelId))) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
        const guild = await interaction.client.guilds.fetch(process.env.GUILD_ID);
        if (channelId && !(await canView(guild, interaction.member, channelId))) {
            return interaction.editReply({ content: 'Δεν έχετε πρόσβαση σε αυτό το κανάλι.' });
        }

        const today = dayKey(new Date());
        const yearEnd = `${year}-12-31`;
        const days = await dailyTotals(pool, `${year}-01-01`, yearEnd, channelId);
        if (!days.length) return interaction.editReply({ content: `Δεν υπάρχουν δεδομένα για το ${year}.` });

        const csv = buildActivityCsv({
            days,
            periods: await periodsForYear(year),
            lastDay: yearEnd < today ? yearEnd : today,
            outsideName: OUTSIDE_PERIODS,
        });
        const channelName = channelId ? guild.channels.cache.get(channelId)?.name ?? channelId : null;
        const name = channelName ? `activity-${year}-${channelName}.csv` : `activity-${year}.csv`;

        await interaction.editReply({
            content: 'Μία γραμμή ανά ημέρα, από την πρώτη ημέρα με καταμετρημένα μηνύματα.',
            files: [new AttachmentBuilder(Buffer.from(csv, 'utf8'), { name })],
        });
    } catch (err) {
        console.error('Stats CSV failed:', err);
        await interaction.editReply({ content: 'Δεν ήταν δυνατή η δημιουργία του αρχείου.' }).catch(() => {});
    }
};
