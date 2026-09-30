const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, EmbedBuilder, MessageFlags, ChannelType } = require("discord.js");
const pool = require("../../lib/database");
const colors = require("../../lib/colors");
const { adminLog } = require("../../lib/adminLog");
const { dayKey, shouldCount, countingStartedAt, getMeta } = require("../../lib/messageStats");

// One-off: counts the message history from before live counting began, so /stats covers the
// whole life of the server. Everything is tallied in memory and written in one transaction,
// so an interrupted run writes nothing and can simply be run again.

const TEXT_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice, ChannelType.GuildStageVoice];
const THREAD_PARENT_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildMedia];

let running = false;

function canRead(channel, me) {
    return channel.permissionsFor(me)?.has(["ViewChannel", "ReadMessageHistory"]) ?? false;
}

async function collectThreads(guild, me) {
    const threads = new Map();
    const active = await guild.channels.fetchActiveThreads();
    for (const t of active.threads.values()) threads.set(t.id, t);

    for (const parent of guild.channels.cache.values()) {
        if (!THREAD_PARENT_TYPES.includes(parent.type) || !canRead(parent, me)) continue;
        let before;
        for (;;) {
            const page = await parent.threads.fetchArchived({ type: "public", before, limit: 100 }).catch(() => null);
            if (!page) break;
            for (const t of page.threads.values()) threads.set(t.id, t);
            if (!page.hasMore || !page.threads.size) break;
            before = page.threads.last().id;
        }
    }
    return [...threads.values()];
}

// Adds every countable message older than cutoff to tally, keyed "day|channelId".
async function tallyChannel(channel, statsChannelId, cutoff, guildId, tally) {
    let before;
    let counted = 0;
    for (;;) {
        const page = await channel.messages.fetch({ limit: 100, before });
        if (!page.size) break;
        for (const message of page.values()) {
            if (message.createdTimestamp >= cutoff || !shouldCount(message, guildId)) continue;
            const key = `${dayKey(message.createdAt)}|${statsChannelId}`;
            tally.set(key, (tally.get(key) || 0) + 1);
            counted++;
        }
        before = page.last().id;
    }
    return counted;
}

async function writeTally(tally) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        for (const [key, count] of tally) {
            const [day, channelId] = key.split("|");
            await conn.query(
                "INSERT INTO message_counts (day, channel_id, count) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE count = count + VALUES(count)",
                [day, channelId, count],
            );
        }
        await conn.query(
            "INSERT INTO bot_meta (meta_key, meta_value) VALUES ('backfill_done', ?) ON DUPLICATE KEY UPDATE meta_value = VALUES(meta_value)",
            [String(Date.now())],
        );
        await conn.commit();
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

async function runBackfill(client, guild) {
    const cutoff = await countingStartedAt(pool);
    const me = await guild.members.fetchMe();
    await guild.channels.fetch();

    const tally = new Map();
    let total = 0;
    const skipped = [];

    const channels = guild.channels.cache.filter((c) => TEXT_TYPES.includes(c.type));
    for (const channel of channels.values()) {
        if (!canRead(channel, me)) {
            skipped.push(channel.id);
            continue;
        }
        total += await tallyChannel(channel, channel.id, cutoff, guild.id, tally);
    }
    for (const thread of await collectThreads(guild, me)) {
        if (!canRead(thread, me)) continue;
        total += await tallyChannel(thread, thread.parentId, cutoff, guild.id, tally);
    }

    await writeTally(tally);
    return { total, skipped };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats-backfill')
        .setDescription('Καταμέτρηση των παλιών μηνυμάτων για τα στατιστικά (μία φορά, διαχειριστές).')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setContexts(InteractionContextType.Guild),

    run: async ({ interaction, client }) => {
        if (running) {
            return interaction.reply({ content: 'Η καταμέτρηση τρέχει ήδη.', flags: MessageFlags.Ephemeral });
        }
        if (await getMeta(pool, 'backfill_done')) {
            return interaction.reply({ content: 'Τα παλιά μηνύματα έχουν ήδη καταμετρηθεί. Νέα εκτέλεση θα τα μετρούσε δύο φορές.', flags: MessageFlags.Ephemeral });
        }

        running = true;
        await interaction.reply({
            content: 'Η καταμέτρηση ξεκίνησε. Μπορεί να πάρει αρκετά λεπτά. Το αποτέλεσμα θα γραφτεί στο κανάλι καταγραφής.',
            flags: MessageFlags.Ephemeral,
        });

        const started = Date.now();
        runBackfill(client, interaction.guild)
            .then(({ total, skipped }) => adminLog(client, new EmbedBuilder()
                .setColor(colors.green)
                .setTitle('Καταμέτρηση παλιών μηνυμάτων')
                .setDescription(
                    `Μετρήθηκαν \`${total}\` μηνύματα σε ${Math.round((Date.now() - started) / 60000)} λεπτά.` +
                    (skipped.length ? `\nΚανάλια χωρίς πρόσβαση (παραλείφθηκαν): ${skipped.map((id) => `<#${id}>`).join(', ')}` : ''),
                )))
            .catch((err) => {
                console.error('Stats backfill failed:', err);
                return adminLog(client, new EmbedBuilder()
                    .setColor(colors.red)
                    .setTitle('Καταμέτρηση παλιών μηνυμάτων')
                    .setDescription('Η καταμέτρηση απέτυχε και δεν αποθηκεύτηκε τίποτα. Μπορείτε να την ξανατρέξετε.'));
            })
            .finally(() => { running = false; });
    },

    options: { modOnly: true },
};
