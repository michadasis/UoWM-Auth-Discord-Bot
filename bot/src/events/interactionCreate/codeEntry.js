const { OPEN_BUTTON_ID, MODAL_ID, CODE_INPUT_ID, codeModal, handleCode } = require("../../lib/codeEntry");

// "Εισαγωγή κωδικού" button under the /auth reply, and the modal it opens.
module.exports = async (interaction) => {
    try {
        if (interaction.isButton() && interaction.customId === OPEN_BUTTON_ID) {
            await interaction.showModal(codeModal());
        } else if (interaction.isModalSubmit() && interaction.customId === MODAL_ID) {
            await handleCode(interaction, interaction.fields.getTextInputValue(CODE_INPUT_ID));
        }
    } catch (err) {
        console.error('Code entry interaction failed:', err);
    }
};
