const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, MessageFlags, ChannelType, PermissionFlagsBits } = require("discord.js");
const path = require("path");
const pool = require("../../lib/database");
const colors = require("../../lib/colors");
const { membersEmbed } = require("../../lib/memberStats");
const { buildActivitySvg, renderPng } = require("../../lib/activityChart");
const { dayKey, loadPeriodEntries, expandPeriods, dailyTotals, totalsByPeriod, topChannels, getMeta, formatDay } = require("../../lib/messageStats");

const PERIODS_FILE = path.resolve(process.env.PERIODS_FILE || "data/periods.json");
const OUTSIDE_PERIODS = "Εκτός περιόδων";

// Day and month only, for ranges inside the year the embed is about.
const shortDay = (day) => formatDay(day).replace(/\/\d{4}$/, '');

// Channels that can hold counted messages. Threads are counted under their parent channel.
const COUNTED_CHANNEL_TYPES = [
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildVoice,
    ChannelType.GuildStageVoice,
    ChannelType.GuildForum,
    ChannelType.GuildMedia,
    ChannelType.PublicThread,
    ChannelType.AnnouncementThread,
];

// Whoever asks only sees numbers for channels they can see themselves. In DMs there is no member,
// so only channels visible to everyone count.
async function canView(guild, member, channelId) {
    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) return false;
    const permissions = member ? channel.permissionsFor(member) : channel.permissionsFor(guild.roles.everyone);
    return permissions?.has(PermissionFlagsBits.ViewChannel) ?? false;
}

const notice = (title, description) => ({ embeds: [new EmbedBuilder().setColor(colors.yellow).setTitle(title).setDescription(description)] });

// The reply for /stats activity: { embeds, files }. channel: optional, from the command option.
async function activityReply(client, member, requestedYear, requestedChannel) {
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

    // A thread's messages are stored under its parent channel.
    const isThread = requestedChannel && [ChannelType.PublicThread, ChannelType.AnnouncementThread].includes(requestedChannel.type);
    const channelId = requestedChannel ? (isThread && requestedChannel.parentId ? requestedChannel.parentId : requestedChannel.id) : null;
    if (channelId && !(await canView(guild, member, channelId))) {
        return notice('Δεν υπάρχει πρόσβαση', 'Δεν έχετε πρόσβαση σε αυτό το κανάλι, οπότε δεν μπορείτε να δείτε τα στατιστικά του.');
    }
    const where = channelId ? ` στο <#${channelId}>` : '';

    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const days = await dailyTotals(pool, yearStart, yearEnd, channelId);
    if (!days.length) {
        const backfilled = await getMeta(pool, 'backfill_done');
        return notice(`Δεν υπάρχουν δεδομένα για το ${year}`,
            `Δεν έχουν καταμετρηθεί μηνύματα${where} για αυτό το έτος.` +
            (backfilled ? '' : ' Τα παλιά μηνύματα μετριούνται όταν ένας διαχειριστής τρέξει το `/stats-backfill`.'));
    }

    let periods = [];
    try {
        periods = expandPeriods(await loadPeriodEntries(PERIODS_FILE), year - 1, year);
    } catch (err) {
        console.error(`Reading periods file failed: ${err.message}`);
    }

    const total = days.reduce((sum, d) => sum + d.count, 0);
    const lines = [];
    if (channelId) lines.push(`**Κανάλι:** <#${channelId}>`);
    lines.push(`**Σύνολο:** \`${total}\` μηνύματα`, '');

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

    if (!channelId) {
        // Fetch a few extra so hidden channels (e.g. admin channels) can be skipped.
        const top = [];
        for (const c of await topChannels(pool, yearStart, yearEnd, 10)) {
            if (top.length < 3 && await canView(guild, member, c.channelId)) top.push(c);
        }
        if (top.length) lines.push(`**Πιο ενεργά κανάλια:** ${top.map((c) => `<#${c.channelId}> \`${c.count}\``).join(' · ')}`);
    }

    const footer = [];
    if (days[0].day > yearStart) footer.push(`καταμέτρηση από ${formatDay(days[0].day)}`);
    if (year === thisYear) footer.push(`έως σήμερα, ${formatDay(today)}`);
    if (footer.length) {
        if (lines[lines.length - 1] !== '') lines.push('');
        lines.push(`-# ${footer.join(', ').replace(/^./, (c) => c.toUpperCase())}`);
    }

    const title = channelId ? `Δραστηριότητα ${year} · #${guild.channels.cache.get(channelId)?.name ?? 'κανάλι'}` : `Δραστηριότητα ${year}`;
    const embed = new EmbedBuilder().setColor(colors.blue).setTitle(title).setDescription(lines.join('\n'));

    // The chart is a bonus: if it cannot be drawn, the numbers are still sent.
    try {
        const name = channelId ? `activity-${year}-${channelId}.png` : `activity-${year}.png`;
        const png = renderPng(buildActivitySvg({ year, days, periods, today }));
        return { embeds: [embed.setImage(`attachment://${name}`)], files: [new AttachmentBuilder(png, { name })] };
    } catch (err) {
        console.error(`Drawing activity chart failed: ${err.message}`);
        return { embeds: [embed] };
    }
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
                .setMaxValue(2100))
            .addChannelOption((o) => o
                .setName('channel')
                .setDescription('Μόνο για ένα κανάλι. Προεπιλογή: όλος ο server.')
                .addChannelTypes(...COUNTED_CHANNEL_TYPES))),

    run: async ({ interaction, client }) => {
        await interaction.deferReply({ flags: interaction.guild !== null ? MessageFlags.Ephemeral : undefined });

        let reply;
        try {
            reply = interaction.options.getSubcommand() === 'members'
                ? { embeds: [await membersEmbed(client)] }
                : await activityReply(client, interaction.member, interaction.options.getInteger('year'), interaction.options.getChannel('channel'));
        } catch (err) {
            console.error('/stats failed:', err);
            reply = { embeds: [new EmbedBuilder().setColor(colors.red).setTitle('Σφάλμα').setDescription('Τα στατιστικά δεν είναι διαθέσιμα αυτή τη στιγμή.')] };
        }
        await interaction.editReply(reply);
    },

    options: {},
};
