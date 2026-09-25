const { ApplicationCommandType, EmbedBuilder, PermissionFlagsBits, InteractionContextType } = require('discord.js');
const pool = require("../../lib/database");
const colors = require('../../lib/colors');

module.exports = {
    data: {
        name: 'Remove Guest Role',
        type: ApplicationCommandType.User,
        default_member_permissions: String(PermissionFlagsBits.ManageRoles),
        contexts: [InteractionContextType.Guild],
    },

    run: async ({ interaction, client }) => {
        const target = interaction.targetUser;
        const guestResult = await pool.query('SELECT msg_id FROM guests WHERE discord_id = ?', [target.id]);

        if (guestResult.length === 0) {
            const errorEmbed = new EmbedBuilder()
                .setColor(colors.red)
                .setTitle('Σφάλμα')
                .setDescription(`Ο χρήστης <@${target.id}> δεν υπάρχει στη λίστα των <@&${process.env.GUEST_ROLE_ID}>.`);
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }

        const problems = [];

        await pool.query('DELETE FROM guests WHERE discord_id = ?', [target.id]);

        try {
            const channel = await client.channels.fetch(process.env.GUEST_CHANNEL_ID);
            const message = await channel.messages.fetch(guestResult[0].msg_id);
            await message.delete();
        } catch (error) {
            problems.push('η διαγραφή του μηνύματος καταγραφής');
        }

        try {
            const member = await interaction.guild.members.fetch(target.id);
            await member.roles.remove(process.env.GUEST_ROLE_ID, `Guest role removed by ${interaction.user.id}`);
        } catch (error) {
            problems.push('η αφαίρεση του ρόλου');
        }

        const embed = problems.length
            ? new EmbedBuilder()
                .setColor(colors.orange)
                .setTitle('Μερικό σφάλμα')
                .setDescription(`Ο χρήστης <@${target.id}> αφαιρέθηκε από τη λίστα των <@&${process.env.GUEST_ROLE_ID}>, αλλά απέτυχε ${problems.join(' και ')}.`)
            : new EmbedBuilder()
                .setColor(colors.green)
                .setTitle('Επιτυχία')
                .setDescription(`Ο χρήστης <@${target.id}> αφαιρέθηκε από τη λίστα των <@&${process.env.GUEST_ROLE_ID}>.`);

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },

    options: {
        modOnly: true,
    },
};
