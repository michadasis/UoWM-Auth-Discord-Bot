const { EmbedBuilder } = require("discord.js");
const pool = require("../../lib/database");
const colors = require("../../lib/colors");
const { adminLog } = require("../../lib/adminLog");

// Data minimization: a member who leaves the server has all stored data deleted.
module.exports = async (member, client) => {
    if (member.guild.id !== process.env.GUILD_ID) return;

    try {
        const users = await pool.query('DELETE FROM users WHERE discord_user_id = ?', [member.id]);
        const guests = await pool.query('DELETE FROM guests WHERE discord_id = ?', [member.id]);
        await pool.query('DELETE FROM email_challenges WHERE discord_user_id = ?', [member.id]);

        if (users.affectedRows || guests.affectedRows) {
            await adminLog(client, new EmbedBuilder()
                .setColor(colors.orange)
                .setTitle('Αποχώρηση μέλους')
                .setDescription(`Ο χρήστης <@${member.id}> αποχώρησε από τον διακομιστή και τα δεδομένα επιβεβαίωσής του διαγράφηκαν.`));
        }
    } catch (err) {
        console.error(`Could not delete data of departed member ${member.id}:`, err);
    }
};
