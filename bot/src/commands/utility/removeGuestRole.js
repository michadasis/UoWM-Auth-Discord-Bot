const { ApplicationCommandType, EmbedBuilder, PermissionFlagsBits, InteractionContextType, MessageFlags } = require('discord.js');
const { removeGuest } = require("../../lib/guests");
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
        const { found, problems } = await removeGuest(client, interaction.guild, target.id, interaction.user.id);

        if (!found) {
            const errorEmbed = new EmbedBuilder()
                .setColor(colors.red)
                .setTitle('Σφάλμα')
                .setDescription(`Ο χρήστης <@${target.id}> δεν υπάρχει στη λίστα των <@&${process.env.GUEST_ROLE_ID}>.`);
            return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
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

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    },

    options: {
        modOnly: true,
    },
};
