// The bot's status: one or more lines in BOT_STATUS, shown in turn. A line starting with
// Playing, Watching, Listening to or Competing in becomes that kind of activity; any other line
// is shown as it is, as a custom status.

const { ActivityType } = require("discord.js");

const DEFAULT_STATUS = "Γράψε /auth για επαλήθευση";
const DEFAULT_INTERVAL_MINUTES = 5;
const MAX_LENGTH = 128;

const PREFIXES = [
    ["playing ", ActivityType.Playing],
    ["watching ", ActivityType.Watching],
    ["listening to ", ActivityType.Listening],
    ["competing in ", ActivityType.Competing],
];

function parseStatus(line) {
    const text = line.trim();
    const lower = text.toLowerCase();
    for (const [prefix, type] of PREFIXES) {
        if (lower.startsWith(prefix) && text.length > prefix.length) return { type, name: text.slice(prefix.length).trim() };
    }
    return { type: ActivityType.Custom, name: "status", state: text };
}

// The status lines from a BOT_STATUS value. In .env, lines can be separated with \n.
function statusLines(value) {
    const lines = String(value || "").replace(/\\n/g, "\n").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return lines.length ? lines : [DEFAULT_STATUS];
}

function intervalMs(env = process.env) {
    const minutes = Number(env.BOT_STATUS_INTERVAL);
    return (Number.isFinite(minutes) && minutes >= 1 ? minutes : DEFAULT_INTERVAL_MINUTES) * 60 * 1000;
}

const presenceFor = (line) => ({ activities: [parseStatus(line)] });

// Shows the statuses in turn. Restart after a settings change.
function createRotation(client) {
    let timer = null;
    let index = 0;

    function show() {
        const lines = statusLines(process.env.BOT_STATUS);
        const presence = presenceFor(lines[index % lines.length]);
        index = (index + 1) % lines.length;
        client.options.presence = presence; // restored after reconnects
        client.user?.setPresence(presence);
    }

    function restart() {
        clearInterval(timer);
        index = 0;
        show();
        if (statusLines(process.env.BOT_STATUS).length > 1) {
            timer = setInterval(show, intervalMs());
            timer.unref?.();
        }
    }

    return { restart, stop: () => clearInterval(timer) };
}

module.exports = { parseStatus, statusLines, intervalMs, presenceFor, createRotation, DEFAULT_STATUS, MAX_LENGTH };
