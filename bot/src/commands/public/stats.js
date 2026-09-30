const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const path = require("path");
const pool = require("../../lib/database");
const colors = require("../../lib/colors");
const { membersEmbed } = require("../../lib/memberStats");
const { dayKey, loadPeriodEntries, expandPeriods, dailyTotals, totalsByPeriod, topChannels, getMeta, formatDay } = require("../../lib/messageStats");

const PERIODS_FILE = path.resolve(process.env.PERIODS_FILE || "data/periods.json");
const OUTSIDE_PERIODS = "Εκτός περιόδων";

// Day and month only, for ranges inside the year the embed is about.
const shortDay = (day) => formatDay(day).replace(/\/\d{4}$/, '');

const notice = (title, description) => new EmbedBuilder().setColor(colors.yellow).setTitle(title).setDescription(description);

async function activityEmbed(client, requestedYear) {
    const today = dayKey(new Date());
    const thisYear = Number(today.slice(0, 4));
    const year = requestedYear ?? thisYear;

    if (year > thisYear) {
        return notice(`Το ${year} δεν έχει έρθει ακόμα`,
            `Τα στατιστικά ενός έτους είναι διαθέσιμα από την αρχή του. Δοκιμάστε \`/stats activity year:${thisYear}\`.`);
    }

    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const created = dayKey(guild.createdAt);
    const createdYear = Number(created.slice(0, 4));
    if (year < createdYear) {
        const range = createdYear === thisYear ? `${thisYear}` : `${createdYear} έως ${thisYear}`;
        return notice(`Ο server δεν υπήρχε το ${year}`,
            `Ο server δημιουργήθηκε στις ${formatDay(created)}. Διαθέσιμα έτη: ${range}.`);
    }

    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const days = await dailyTotals(pool, yearStart, yearEnd);
    if (!days.length) {
        const backfilled = await getMeta(pool, 'backfill_done');
        return notice(`Δεν υπάρχουν δεδομένα για το ${year}`,
            'Δεν έχουν καταμετρηθεί μηνύματα για αυτό το έτος.' +
            (backfilled ? '' : ' Τα παλιά μηνύματα μετριούνται όταν ένας διαχειριστής τρέξει το `/stats-backfill`.'));
    }

    let periods = [];
    try {
        periods = expandPeriods(await loadPeriodEntries(PERIODS_FILE), year - 1, year);
    } catch (err) {
        console.error(`Reading periods file failed: ${err.message}`);
    }

    const total = days.reduce((sum, d) => sum + d.count, 0);
    const lines = [`**Σύνολο:** \`${total}\` μηνύματα`, ''];

    if (periods.length) {
        lines.push('**Ανά περίοδο**');
        for (const group of totalsByPeriod(days, periods, OUTSIDE_PERIODS)) {
            const range = group.period
                ? ` (${shortDay(group.period.start < yearStart ? yearStart : group.period.start)} έως ${shortDay(group.period.end > yearEnd ? yearEnd : group.period.end)})`
                : '';
            lines.push(`${group.name}${range}: \`${group.count}\``);
        }
        lines.push('');
    }

    const top = await topChannels(pool, yearStart, yearEnd, 3);
    if (top.length) lines.push(`**Πιο ενεργά κανάλια:** ${top.map((c) => `<#${c.channelId}> \`${c.count}\``).join(' · ')}`);

    const footer = [];
    if (days[0].day > yearStart) footer.push(`καταμέτρηση από ${formatDay(days[0].day)}`);
    if (year === thisYear) footer.push(`έως σήμερα, ${formatDay(today)}`);
    if (footer.length) lines.push('', `-# ${footer.join(', ').replace(/^./, (c) => c.toUpperCase())}`);

    return new EmbedBuilder().setColor(colors.blue).setTitle(`Δραστηριότητα ${year}`).setDescription(lines.join('\n'));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Στατιστικά του server.')
        .addSubcommand((s) => s
            .setName('members')
            .setDescription('Επαληθευμένα μέλη ανά ιδιότητα και προσωρινές άδειες.'))
        .addSubcommand((s) => s
            .setName('activity')
            .setDescription('Μηνύματα ανά περίοδο για ένα έτος.')
            .addIntegerOption((o) => o
                .setName('year')
                .setDescription('Το έτος, π.χ. 2026. Προεπιλογή: το τρέχον.')
                .setMinValue(2015)
                .setMaxValue(2100))),

    run: async ({ interaction, client }) => {
        await interaction.deferReply({ flags: interaction.guild !== null ? MessageFlags.Ephemeral : undefined });

        let embed;
        try {
            embed = interaction.options.getSubcommand() === 'members'
                ? await membersEmbed(client)
                : await activityEmbed(client, interaction.options.getInteger('year'));
        } catch (err) {
            console.error('/stats failed:', err);
            embed = new EmbedBuilder().setColor(colors.red).setTitle('Σφάλμα').setDescription('Τα στατιστικά δεν είναι διαθέσιμα αυτή τη στιγμή.');
        }
        await interaction.editReply({ embeds: [embed] });
    },

    options: {},
};
