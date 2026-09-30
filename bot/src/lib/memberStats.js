// The "members" statistics embed, shared by /stats members and the live message of
// /post-verified-stats.

const { EmbedBuilder } = require("discord.js");
const pool = require("./database");
const colors = require("./colors");

// Discord timestamp of when the bot came online. The client renders it in the reader's own
// time zone and language, and the relative part ("πριν από 3 ώρες") keeps updating by itself.
function onlineSince(client) {
    const since = Math.floor((client.readyTimestamp ?? Date.now() - (client.uptime ?? 0)) / 1000);
    return `<t:${since}:f> (<t:${since}:R>)`;
}

async function membersEmbed(client) {
    const rows = await pool.query('SELECT affiliation, COUNT(*) AS n FROM users GROUP BY affiliation');
    const count = (affiliation) => Number(rows.find((r) => r.affiliation === affiliation)?.n ?? 0);
    const guests = Number((await pool.query('SELECT COUNT(*) AS n FROM guests'))[0].n);
    const verified = count('student') + count('faculty') + count('staff');

    return new EmbedBuilder()
        .setColor(colors.blue)
        .setTitle('Μέλη')
        .setDescription([
            `**Φοιτητές:** \`${count('student')}\``,
            `**Καθηγητές:** \`${count('faculty')}\``,
            `**Προσωπικό:** \`${count('staff')}\``,
            `**Προσωρινή άδεια:** \`${guests}\``,
            '',
            `**Σύνολο επαληθευμένων:** \`${verified}\``,
            '',
            `-# Bot σε λειτουργία από ${onlineSince(client)}`,
        ].join('\n'));
}

module.exports = { onlineSince, membersEmbed };
