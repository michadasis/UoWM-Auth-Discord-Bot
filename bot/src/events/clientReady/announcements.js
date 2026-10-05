const pool = require("../../lib/database");
const { startScheduler, sendDue } = require("../../lib/announcements");

// Sends scheduled announcements (also any that came due while the bot was offline).
module.exports = async (c, client) => {
    await sendDue(client, pool).catch((err) => console.error("Sending due announcements failed:", err.message));
    startScheduler(client, pool);
};
