const { MessageFlags } = require("discord.js");
const { giveGuest } = require("../../lib/guests");

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
        await giveGuest(interaction.guild, targetId, reasonInput, interaction.user.id);
        await interaction.reply({ content: `Ο ρόλος <@&${process.env.GUEST_ROLE_ID}> δόθηκε επιτυχώς.`, flags: MessageFlags.Ephemeral });
    } catch (err) {
        console.error('Giving guest role failed:', err);
        await interaction.reply({ content: 'Δεν ήταν δυνατή η απόδοση του ρόλου Guest.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
};
