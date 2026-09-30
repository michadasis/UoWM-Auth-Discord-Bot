const pool = require("../../lib/database");
const { ensureSchema, countingStartedAt } = require("../../lib/messageStats");

// Creates the statistics tables on existing installs (db/setup.sql only runs on a fresh database)
// and records when live counting began, which /stats-backfill uses as its cutoff.
module.exports = async () => {
    try {
        await ensureSchema(pool);
        await countingStartedAt(pool);
    } catch (err) {
        console.error("Setting up message statistics failed:", err);
    }
};
