// Shared by /stats activity and its "Λήψη CSV" button.

const path = require("path");
const { PermissionFlagsBits } = require("discord.js");
const { loadPeriodEntries, parsePeriods, expandPeriods } = require("./messageStats");
const texts = require("./texts");

const PERIODS_FILE = path.resolve(process.env.PERIODS_FILE || "data/periods.json");
const OUTSIDE_PERIODS = "Εκτός περιόδων";

// Whoever asks only sees numbers for channels they can see themselves. In DMs there is no member,
// so only channels visible to everyone count.
async function canView(guild, member, channelId) {
    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) return false;
    const permissions = member ? channel.permissionsFor(member) : channel.permissionsFor(guild.roles.everyone);
    return permissions?.has(PermissionFlagsBits.ViewChannel) ?? false;
}

// The periods: the version edited in the admin panel if there is one, otherwise data/periods.json.
async function periodEntries() {
    const stored = texts.getText("periods");
    return stored === null ? loadPeriodEntries(PERIODS_FILE) : parsePeriods(stored);
}

// Periods covering a calendar year, or [] if the periods file is missing or broken.
async function periodsForYear(year) {
    try {
        return expandPeriods(await periodEntries(), year - 1, year);
    } catch (err) {
        console.error(`Reading periods file failed: ${err.message}`);
        return [];
    }
}

module.exports = { OUTSIDE_PERIODS, PERIODS_FILE, canView, periodsForYear, periodEntries };
