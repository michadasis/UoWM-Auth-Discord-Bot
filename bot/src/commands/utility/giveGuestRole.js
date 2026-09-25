const { ApplicationCommandType, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, PermissionFlagsBits, InteractionContextType } = require('discord.js');
const pool = require("../../lib/database");
const colors = require('../../lib/colors');

function errorReply(interaction, description) {
    const embed = new EmbedBuilder().setColor(colors.red).setTitle('Σφάλμα').setDescription(description);
    return interaction.reply({ embeds: [embed], ephemeral: true });
}

module.exports = {
    data: {
        name: 'Give Guest Role',
        type: ApplicationCommandType.User,
        default_member_permissions: String(PermissionFlagsBits.ManageRoles),
        contexts: [InteractionContextType.Guild],
    },

    run: async ({ interaction }) => {
        const target = interaction.targetUser;

        if (target.bot) {
            return errorReply(interaction, 'Ο ρόλος Guest δεν μπορεί να δοθεί σε bot.');
        }

        const guestResult = await pool.query('SELECT discord_id FROM guests WHERE discord_id = ?', [target.id]);
        if (guestResult.length === 1) {
            return errorReply(interaction, `Ο χρήστης <@${target.id}> έχει ήδη τον ρόλο <@&${process.env.GUEST_ROLE_ID}>.`);
        }

        const usersResult = await pool.query('SELECT discord_user_id FROM users WHERE discord_user_id = ?', [target.id]);
        if (usersResult.length === 1) {
            return errorReply(interaction, `Ο χρήστης <@${target.id}> είναι ήδη επιβεβαιωμένος, οπότε δεν χρειάζεται τον ρόλο <@&${process.env.GUEST_ROLE_ID}>.`);
        }

        const modal = new ModalBuilder({
            customId: `reason-${target.id}`,
            title: 'Give Guest Role',
        });

        const reasonInput = new TextInputBuilder({
            customId: 'guestRoleReason',
            label: 'Αιτιολογία',
            placeholder: `Εξηγήστε γιατί ο/η ${target.username} λαμβάνει τον ρόλο Guest.`,
            minLength: 10,
            maxLength: 500,
            required: true,
            style: TextInputStyle.Paragraph,
        });

        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
        await interaction.showModal(modal);
    },

    options: {
        modOnly: true,
    },
};
