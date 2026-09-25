const { Client, GatewayIntentBits } = require("discord.js");
const { CommandKit } = require("commandkit");
const path = require("path");
const { loadEmailConfig } = require("./lib/config");

// Fail fast on missing or invalid email settings instead of at the first /auth.
try {
    loadEmailConfig();
} catch (err) {
    console.error(err.message);
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        // Privileged: needed for role sync on join/leave/role changes. Enable "Server Members Intent" in the developer portal.
        GatewayIntentBits.GuildMembers,
    ],
});

// discord.js renamed "ready" to "clientReady"; CommandKit 0.1.x still listens to "ready" internally
// (command registration) and for the events/ folder. Redirect those listeners so nothing uses the
// deprecated event. Remove when upgrading to a CommandKit version that uses clientReady.
for (const method of ['on', 'once']) {
    const original = client[method].bind(client);
    client[method] = (event, listener) => original(event === 'ready' ? 'clientReady' : event, listener);
}

new CommandKit({
    client,
    commandsPath: path.join(__dirname, 'commands'),
    eventsPath: path.join(__dirname, 'events'),
    validationsPath: path.join(__dirname, 'validations'),
    devGuildIds: [process.env.GUILD_ID],
    bulkRegister: true,
});

client.login(process.env.DISCORD_TOKEN);
