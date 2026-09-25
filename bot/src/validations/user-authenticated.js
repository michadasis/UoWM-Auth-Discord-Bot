const { EmbedBuilder, MessageFlags } = require("discord.js");
const colors = require('../lib/colors');
const { getVerification } = require('../lib/verification');

// Commands with options.userAuth can only be run by verified members.
module.exports = async ({ interaction, commandObj }) => {
    if (!commandObj.options?.userAuth) return;

    try {
        if (await getVerification(interaction.user.id)) return;

        const errorEmbed = new EmbedBuilder()
            .setColor(colors.red)
            .setTitle('Σφάλμα εκτέλεσης εντολής')
            .setDescription('Για αυτήν την εντολή πρέπει να έχετε επιβεβαιώσει τον λογαριασμό σας. Χρησιμοποιήστε την εντολή `/auth`.');
        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
    } catch (error) {
        console.error(error);
    }
    return true;
};
