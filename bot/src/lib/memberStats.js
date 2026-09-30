// The "members" statistics embed, shared by /stats members and the live message of
// /post-verified-stats.

const { EmbedBuilder } = require("discord.js");
const pool = require("./database");
const colors = require("./colors");

function uptimeText(client) {
    let seconds = client.uptime / 1000;
    const days = Math.floor(seconds / 86400);
    seconds %= 86400;
    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    return `${days} ημέρες, ${hours} ώρες, ${Math.floor(seconds / 60)} λεπτά`;
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
            `-# Διάρκεια λειτουργίας bot: ${uptimeText(client)}`,
        ].join('\n'));
}

module.exports = { uptimeText, membersEmbed };
