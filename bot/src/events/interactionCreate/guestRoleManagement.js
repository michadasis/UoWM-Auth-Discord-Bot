const pool = require("../../lib/database");
const colors = require("../../lib/colors");
const { EmbedBuilder, MessageFlags } = require("discord.js");

// Handles the reason modal shown by the "Give Guest Role" context menu command.
module.exports = async (interaction) => {
    if (!interaction.isModalSubmit() || !interaction.customId.startsWith("reason-")) return;

    // The modal is only shown to moderators, but check again: this path bypasses command validations.
    const roles = interaction.member?.roles?.cache;
    if (!roles || ![process.env.ADMIN_ROLE_ID, process.env.MODERATOR_ROLE_ID].some((id) => id && roles.has(id))) {
        return interaction.reply({ content: 'Δεν έχετε δικαίωμα για αυτή την ενέργεια.', flags: MessageFlags.Ephemeral });
    }

    const reasonInput = interaction.fields.getTextInputValue('guestRoleReason');
    const targetId = interaction.customId.slice("reason-".length);

    try {
        const member = await interaction.guild.members.fetch(targetId);
        await member.roles.add(process.env.GUEST_ROLE_ID, `Guest role given by ${interaction.user.id}`);

        await pool.query(
            'INSERT INTO guests (discord_id, reason, given_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE reason = VALUES(reason), given_by = VALUES(given_by)',
            [targetId, reasonInput, interaction.user.id],
        );

        const logEmbed = new EmbedBuilder()
            .setColor(colors.blue)
            .setTitle('Νέος Guest')
            .setDescription(`Ο <@${interaction.user.id}> έδωσε τον ρόλο <@&${process.env.GUEST_ROLE_ID}> στον χρήστη <@${targetId}> με αιτιολογία: \`${reasonInput}\``);

        try {
            const channel = await interaction.guild.channels.fetch(process.env.GUEST_CHANNEL_ID);
            const msg = await channel.send({ embeds: [logEmbed], allowedMentions: { parse: [] } });
            await pool.query('UPDATE guests SET msg_id = ? WHERE discord_id = ?', [msg.id, targetId]);
        } catch (err) {
            console.error(`Could not write guest log: ${err.message}`);
        }

        const userEmbed = new EmbedBuilder()
            .setColor(colors.blue)
            .setTitle('Απόκτηση ρόλου Guest')
            .setDescription('Ένας διαχειριστής του server σάς έδωσε τον ρόλο Guest. Μόλις αποκτήσετε ιδρυματικό λογαριασμό, χρησιμοποιήστε την εντολή `/auth` για να επιβεβαιωθείτε και να αποκτήσετε πλήρη πρόσβαση.');
        await member.send({ embeds: [userEmbed] }).catch(() => {});

        await interaction.reply({ content: `Ο ρόλος <@&${process.env.GUEST_ROLE_ID}> δόθηκε επιτυχώς.`, flags: MessageFlags.Ephemeral });
    } catch (err) {
        console.error('Giving guest role failed:', err);
        await interaction.reply({ content: 'Δεν ήταν δυνατή η απόδοση του ρόλου Guest.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
};
