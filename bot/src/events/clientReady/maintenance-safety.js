const pool = require("../../lib/database");
const { EmbedBuilder } = require("discord.js");
const colors = require("../../lib/colors");
const { adminLog } = require("../../lib/adminLog");
const { scheduleDailyBackups } = require("../../lib/dbBackup");
const { startWatchdog } = require("../../lib/watchdog");

// Daily database backups and the database watchdog.
module.exports = async (c, client) => {
    scheduleDailyBackups(pool, {
        onDone: (result) => console.log(`Database backup ${result.name} written.`),
        onError: (err) => {
            console.error("Database backup failed:", err);
            adminLog(client, new EmbedBuilder().setColor(colors.red).setTitle("Το ημερήσιο αντίγραφο της βάσης απέτυχε").setDescription(String(err.message).slice(0, 1000)));
        },
    });
    startWatchdog(client, pool);
};
