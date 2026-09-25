// Shared pieces of the "enter code" step: the button under the /auth reply, its modal,
// and running a submitted code.

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const { getVerification } = require("./services");
const { embedFor } = require("./messages");

const OPEN_BUTTON_ID = "verify-code:open";
const MODAL_ID = "verify-code:submit";
const CODE_INPUT_ID = "code";

function codeButtonRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(OPEN_BUTTON_ID).setLabel("Εισαγωγή κωδικού").setStyle(ButtonStyle.Primary),
    );
}

function codeModal() {
    return new ModalBuilder()
        .setCustomId(MODAL_ID)
        .setTitle("Κωδικός επιβεβαίωσης")
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId(CODE_INPUT_ID)
                    .setLabel("Ο εξαψήφιος κωδικός από το email σας")
                    .setStyle(TextInputStyle.Short)
                    .setMinLength(6)
                    .setMaxLength(7)
                    .setPlaceholder("123456")
                    .setRequired(true),
            ),
        );
}

// Defers, runs the code and replies (ephemeral in the server, normal in DMs).
async function handleCode(interaction, code) {
    await interaction.deferReply({ ephemeral: interaction.guild !== null });
    let result;
    try {
        result = await getVerification(interaction.client).submitCode(interaction.user.id, code);
    } catch (err) {
        console.error("Submitting code failed:", err);
        result = { code: "error" };
    }
    await interaction.editReply({ embeds: [embedFor(result)], components: [] });
}

module.exports = { OPEN_BUTTON_ID, MODAL_ID, CODE_INPUT_ID, codeButtonRow, codeModal, handleCode };
