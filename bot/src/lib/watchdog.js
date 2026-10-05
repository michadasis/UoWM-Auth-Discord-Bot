// Checks the database every 2 minutes and writes to the admin log when it stops or starts
// answering again, so a database problem is noticed even while Discord still works.

const { EmbedBuilder } = require("discord.js");
const colors = require("./colors");
const { adminLog } = require("./adminLog");

function startWatchdog(client, pool, { intervalMs = 2 * 60 * 1000 } = {}) {
    let healthy = true;
    let since = Date.now();
    const check = async () => {
        const ok = await Promise.race([pool.query("SELECT 1").then(() => true, () => false), new Promise((r) => setTimeout(() => r(false), 5000))]);
        if (ok === healthy) return;
        healthy = ok;
        const minutes = Math.max(1, Math.round((Date.now() - since) / 60000));
        since = Date.now();
        console[ok ? "log" : "error"](ok ? `Database is back after about ${minutes} min.` : "Database is not answering.");
        await adminLog(client, new EmbedBuilder()
            .setColor(ok ? colors.green : colors.red)
            .setTitle(ok ? "Η βάση δεδομένων λειτουργεί ξανά" : "Η βάση δεδομένων δεν απαντά")
            .setDescription(ok ? `Ήταν εκτός για περίπου ${minutes} λεπτά.` : "Οι επαληθεύσεις και τα στατιστικά δεν δουλεύουν μέχρι να επανέλθει."));
    };
    const timer = setInterval(() => check().catch(() => {}), intervalMs);
    timer.unref?.();
    return { check, stop: () => clearInterval(timer) };
}

module.exports = { startWatchdog };
