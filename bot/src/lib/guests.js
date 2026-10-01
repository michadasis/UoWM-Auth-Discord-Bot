// Temporary access ("Προσωρινή άδεια") for people without an institutional account yet. Used by
// the Give/Remove Guest Role commands and by the admin panel.

const { EmbedBuilder } = require("discord.js");
const pool = require("./database");
const colors = require("./colors");

// Gives the guest role, records it, logs it in GUEST_CHANNEL_ID and tells the member.
async function giveGuest(guild, targetId, reason, byId) {
    const member = await guild.members.fetch(targetId);
    await member.roles.add(process.env.GUEST_ROLE_ID, `Guest role given by ${byId}`);
    await pool.query(
        "INSERT INTO guests (discord_id, reason, given_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE reason = VALUES(reason), given_by = VALUES(given_by)",
        [targetId, reason, byId],
    );

    const logEmbed = new EmbedBuilder()
        .setColor(colors.blue)
        .setTitle("Νέος Guest")
        .setDescription(`Ο <@${byId}> έδωσε τον ρόλο <@&${process.env.GUEST_ROLE_ID}> στον χρήστη <@${targetId}> με αιτιολογία: \`${String(reason).replace(/`/g, "'")}\``);
    try {
        const channel = await guild.channels.fetch(process.env.GUEST_CHANNEL_ID);
        const msg = await channel.send({ embeds: [logEmbed], allowedMentions: { parse: [] } });
        await pool.query("UPDATE guests SET msg_id = ? WHERE discord_id = ?", [msg.id, targetId]);
    } catch (err) {
        console.error(`Could not write guest log: ${err.message}`);
    }

    const userEmbed = new EmbedBuilder()
        .setColor(colors.blue)
        .setTitle("Απόκτηση ρόλου Guest")
        .setDescription("Ένας διαχειριστής του server σάς έδωσε τον ρόλο Guest. Μόλις αποκτήσετε ιδρυματικό λογαριασμό, χρησιμοποιήστε την εντολή `/auth` για να επαληθευτείτε και να αποκτήσετε πλήρη πρόσβαση.");
    await member.send({ embeds: [userEmbed] }).catch(() => {});
    return member;
}

// Removes the guest role and record. Returns { found, problems } (problems: what did not work).
async function removeGuest(client, guild, targetId, byId) {
    const rows = await pool.query("SELECT msg_id FROM guests WHERE discord_id = ?", [targetId]);
    if (!rows.length) return { found: false, problems: [] };

    const problems = [];
    await pool.query("DELETE FROM guests WHERE discord_id = ?", [targetId]);
    try {
        const channel = await client.channels.fetch(process.env.GUEST_CHANNEL_ID);
        const message = await channel.messages.fetch(rows[0].msg_id);
        await message.delete();
    } catch {
        problems.push("η διαγραφή του μηνύματος καταγραφής");
    }
    try {
        const member = await guild.members.fetch(targetId);
        await member.roles.remove(process.env.GUEST_ROLE_ID, `Guest role removed by ${byId}`);
    } catch {
        problems.push("η αφαίρεση του ρόλου");
    }
    return { found: true, problems };
}

module.exports = { giveGuest, removeGuest };
