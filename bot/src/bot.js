const { Client, GatewayIntentBits, ActivityType } = require("discord.js");
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
    // Custom status under the bot's name. Set in the client options so it is restored after reconnects.
    presence: {
        activities: [{ type: ActivityType.Custom, name: 'status', state: process.env.BOT_STATUS || 'Γράψε /auth για επαλήθευση' }],
    },
    intents: [
        GatewayIntentBits.Guilds,
        // Privileged: needed for role sync on join/leave/role changes. Enable "Server Members Intent" in the developer portal.
        GatewayIntentBits.GuildMembers,
        // Message counts for /stats. Not privileged: the bot never reads message content.
        GatewayIntentBits.GuildMessages,
    ],
});

// discord.js renamed "ready" to "clientReady"; CommandKit 0.1.x still listens to "ready" internally
// (command registration) and for the events/ folder. Redirect those listeners so nothing uses the
// deprecated event. Remove when upgrading to a CommandKit version that uses clientReady.
for (const method of ['on', 'once']) {
    const original = client[method].bind(client);
    client[method] = (event, listener) => original(event === 'ready' ? 'clientReady' : event, listener);
}

const commandKit = new CommandKit({
    client,
    commandsPath: path.join(__dirname, 'commands'),
    eventsPath: path.join(__dirname, 'events'),
    validationsPath: path.join(__dirname, 'validations'),
    devGuildIds: [process.env.GUILD_ID],
    bulkRegister: true,
});

// CommandKit loads events and commands asynchronously and only then waits for the first "ready"
// to register the slash commands with Discord. If the bot logs in before that, "ready" can fire
// first and the commands are never registered, so new or changed commands do not show up.
// Log in only once CommandKit has loaded the commands.
(async () => {
    const deadline = Date.now() + 30_000;
    while (!commandKit.commands.length && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!commandKit.commands.length) console.error('CommandKit did not load any commands within 30 seconds, logging in anyway.');
    client.login(process.env.DISCORD_TOKEN);
})();
