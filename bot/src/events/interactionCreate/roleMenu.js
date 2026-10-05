const pool = require("../../lib/database");
const { getMeta } = require("../../lib/messageStats");
const { PREFIX, handleClick } = require("../../lib/roleMenus");
const { recordClick } = require("../../lib/usageStats");

// Buttons of the role menus made in the admin panel.
module.exports = async (interaction) => {
    if (!interaction.isButton() || !interaction.customId.startsWith(`${PREFIX}:`)) return;
    try {
        const verifyInfo = process.env.VERIFY_CHANNEL_ID ? null : await getMeta(pool, "verify_info_message").catch(() => null);
        await handleClick(interaction, {
            verifyChannelId: process.env.VERIFY_CHANNEL_ID || (verifyInfo ? verifyInfo.split(":")[0] : null),
            onToggle: (menuId, roleId, added) => recordClick(pool, menuId, roleId, added).catch((err) => console.error(`Counting a role click failed: ${err.message}`)),
        });
    } catch (err) {
        console.error(`Role button failed: ${err.message}`);
        const reply = { content: "Κάτι πήγε στραβά. Δοκίμασε ξανά σε λίγο." };
        await (interaction.deferred || interaction.replied ? interaction.editReply(reply) : interaction.reply({ ...reply, ephemeral: true })).catch(() => {});
    }
};
