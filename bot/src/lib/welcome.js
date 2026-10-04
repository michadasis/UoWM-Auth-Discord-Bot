// Welcome message for new members, in WELCOME_CHANNEL_ID (replaces Dyno's welcomer).

const DEFAULT_WELCOME = "Καλώς ήρθες {μέλος}, κάνε την επαλήθευση για να έχεις πρόσβαση: {επαλήθευση}.";

function renderWelcome(memberId, env = process.env) {
    const template = (env.WELCOME_MESSAGE || "").trim() || DEFAULT_WELCOME;
    const verify = env.VERIFY_CHANNEL_ID ? `<#${env.VERIFY_CHANNEL_ID}>` : "#επαλήθευση";
    return template.split("{μέλος}").join(`<@${memberId}>`).split("{επαλήθευση}").join(verify);
}

// Sends the welcome; pings only the new member.
async function welcome(member, env = process.env) {
    if (!env.WELCOME_CHANNEL_ID || member.user.bot) return null;
    const channel = await member.guild.channels.fetch(env.WELCOME_CHANNEL_ID);
    return channel.send({ content: renderWelcome(member.id, env), allowedMentions: { users: [member.id] } });
}

module.exports = { DEFAULT_WELCOME, renderWelcome, welcome };
