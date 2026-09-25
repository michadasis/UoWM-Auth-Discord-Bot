const { Client, GatewayIntentBits } = require("discord.js");
const { CommandKit } = require("commandkit");
const path = require("path");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        // Privileged: needed for role sync on join/leave/role changes. Enable "Server Members Intent" in the developer portal.
        GatewayIntentBits.GuildMembers,
    ],
});

new CommandKit({
    client,
    commandsPath: path.join(__dirname, 'commands'),
    eventsPath: path.join(__dirname, 'events'),
    validationsPath: path.join(__dirname, 'validations'),
    devGuildIds: [process.env.GUILD_ID],
    bulkRegister: true,
});

client.login(process.env.DISCORD_TOKEN);
